import { Database } from "bun:sqlite";

import type { StoredEntry, StoredSummary } from "./ingest.ts";

/**
 * The index database. It is a cache of pi's files, never the truth: a schema mismatch,
 * a pi version change or a deleted file drops and rebuilds it, and deleting it by hand
 * loses nothing.
 */

export type IndexMeta = {
	readonly schemaVersion: string;
	readonly piVersion: string;
	readonly formatVersion: number;
};

const schema = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS sessions (
	path TEXT PRIMARY KEY,
	id TEXT NOT NULL,
	cwd TEXT NOT NULL,
	name TEXT,
	parent_session TEXT,
	created INTEGER NOT NULL,
	last_activity INTEGER NOT NULL,
	message_count INTEGER NOT NULL,
	first_message TEXT,
	leaf_id TEXT,
	size INTEGER NOT NULL,
	mtime_ns INTEGER NOT NULL,
	ino INTEGER NOT NULL,
	parsed_bytes INTEGER NOT NULL,
	head_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_id ON sessions(id);
CREATE INDEX IF NOT EXISTS sessions_cwd_activity ON sessions(cwd, last_activity DESC);
CREATE TABLE IF NOT EXISTS entries (
	session_path TEXT NOT NULL,
	seq INTEGER NOT NULL,
	entry_id TEXT NOT NULL,
	parent_id TEXT,
	kind TEXT NOT NULL,
	ts INTEGER,
	offset INTEGER NOT NULL,
	length INTEGER NOT NULL,
	PRIMARY KEY (session_path, seq)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS entries_id ON entries(session_path, entry_id);
`;

type SessionRow = {
	path: string;
	id: string;
	cwd: string;
	name: string | null;
	parent_session: string | null;
	created: number;
	last_activity: number;
	message_count: number;
	first_message: string | null;
	leaf_id: string | null;
	size: number;
	mtime_ns: number;
	ino: number;
	parsed_bytes: number;
	head_hash: string;
};

const toSummary = (row: SessionRow): StoredSummary => ({
	created: row.created,
	cwd: row.cwd,
	firstMessage: row.first_message ?? "",
	headHash: row.head_hash,
	id: row.id,
	ino: row.ino,
	lastActivity: row.last_activity,
	leafId: row.leaf_id,
	messageCount: row.message_count,
	mtimeNs: row.mtime_ns,
	name: row.name ?? undefined,
	parentSession: row.parent_session ?? undefined,
	parsedBytes: row.parsed_bytes,
	path: row.path,
	size: row.size,
});

/** Opens the index and rebuilds it when the schema or the pi version it was built for moved. */
export function openIndex(path: string, meta: IndexMeta): Database {
	const db = new Database(path, { create: true });
	db.run("PRAGMA journal_mode=WAL;");
	db.run("PRAGMA synchronous=NORMAL;");
	db.run("PRAGMA mmap_size=268435456;");
	db.run("PRAGMA temp_store=MEMORY;");
	db.run("PRAGMA busy_timeout=5000;");
	db.run(schema);

	const stored = new Map(
		db
			.query<{ key: string; value: string }, []>("SELECT key, value FROM meta")
			.all()
			.map((row) => [row.key, row.value]),
	);
	const matches =
		stored.get("schema_version") === meta.schemaVersion &&
		stored.get("pi_version") === meta.piVersion &&
		stored.get("format_version") === String(meta.formatVersion);
	if (!matches) {
		db.run("DELETE FROM entries; DELETE FROM sessions; DELETE FROM meta;");
		const write = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
		write.run("schema_version", meta.schemaVersion);
		write.run("pi_version", meta.piVersion);
		write.run("format_version", String(meta.formatVersion));
	}
	return db;
}

export function rowFor(db: Database, path: string): StoredSummary | null {
	const row = db.query<SessionRow, [string]>("SELECT * FROM sessions WHERE path = ?").get(path);
	return row === null ? null : toSummary(row);
}

export function rowById(db: Database, sessionId: string): StoredSummary | null {
	const row = db.query<SessionRow, [string]>("SELECT * FROM sessions WHERE id = ?").get(sessionId);
	return row === null ? null : toSummary(row);
}

export function allRows(db: Database): ReadonlyArray<StoredSummary> {
	return db
		.query<SessionRow, []>("SELECT * FROM sessions ORDER BY last_activity DESC, path DESC")
		.all()
		.map(toSummary);
}

const upsertStatement = (db: Database) =>
	db.prepare(`INSERT INTO sessions (
		path, id, cwd, name, parent_session, created, last_activity, message_count,
		first_message, leaf_id, size, mtime_ns, ino, parsed_bytes, head_hash
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(path) DO UPDATE SET
		id = excluded.id, cwd = excluded.cwd, name = excluded.name,
		parent_session = excluded.parent_session, created = excluded.created,
		last_activity = excluded.last_activity, message_count = excluded.message_count,
		first_message = excluded.first_message, leaf_id = excluded.leaf_id,
		size = excluded.size, mtime_ns = excluded.mtime_ns, ino = excluded.ino,
		parsed_bytes = excluded.parsed_bytes, head_hash = excluded.head_hash`);

export function upsertSession(db: Database, summary: StoredSummary): void {
	upsertStatement(db).run(
		summary.path,
		summary.id,
		summary.cwd,
		summary.name ?? null,
		summary.parentSession ?? null,
		summary.created,
		summary.lastActivity,
		summary.messageCount,
		summary.firstMessage,
		summary.leafId,
		summary.size,
		summary.mtimeNs,
		summary.ino,
		summary.parsedBytes,
		summary.headHash,
	);
}

export function replaceEntries(
	db: Database,
	path: string,
	entries: ReadonlyArray<StoredEntry>,
): void {
	db.prepare("DELETE FROM entries WHERE session_path = ?").run(path);
	const insert = db.prepare(
		"INSERT INTO entries (session_path, seq, entry_id, parent_id, kind, ts, offset, length) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
	);
	for (const [seq, entry] of entries.entries()) {
		insert.run(
			path,
			seq,
			entry.entryId,
			entry.parentId,
			entry.kind,
			entry.ts,
			entry.offset,
			entry.length,
		);
	}
}

export function appendEntries(
	db: Database,
	path: string,
	entries: ReadonlyArray<StoredEntry>,
): void {
	const next = db
		.query<{ next: number | null }, [string]>(
			"SELECT MAX(seq) + 1 AS next FROM entries WHERE session_path = ?",
		)
		.get(path);
	const insert = db.prepare(
		"INSERT INTO entries (session_path, seq, entry_id, parent_id, kind, ts, offset, length) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
	);
	let seq = next?.next ?? 0;
	for (const entry of entries) {
		insert.run(
			path,
			seq++,
			entry.entryId,
			entry.parentId,
			entry.kind,
			entry.ts,
			entry.offset,
			entry.length,
		);
	}
}

export function deleteSession(db: Database, path: string): void {
	db.prepare("DELETE FROM entries WHERE session_path = ?").run(path);
	db.prepare("DELETE FROM sessions WHERE path = ?").run(path);
}

/** Session rows whose file was not seen in the last scan of `roots`. */
export function stalePaths(db: Database, roots: ReadonlyArray<string>): ReadonlyArray<string> {
	return allRows(db)
		.map((row) => row.path)
		.filter((path) => roots.some((root) => path.startsWith(`${root}/`)));
}
