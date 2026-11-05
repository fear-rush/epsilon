import type { Database } from "bun:sqlite";
import { dirname } from "node:path";

import { Context, Effect, FileSystem, Layer, PubSub, Stream } from "effect";
import type { Scope } from "effect";

import type { FileUnreadable } from "../platform/errors.ts";
import { ensureDir, listJsonl, readRangeSync, readTextSync, statFile } from "../platform/files.ts";
import {
	allRows,
	appendEntries,
	deleteSession,
	openIndex,
	replaceEntries,
	rowFor,
	stalePaths,
	upsertSession,
} from "./index-db.ts";
import type { IndexMeta } from "./index-db.ts";
import { appendToSession, parseSession } from "./ingest.ts";
import type { StoredSummary } from "./ingest.ts";

/**
 * The catalog: a read model of pi's session files, backed by the derived SQLite index.
 *
 * `sync` reconciles the index with the files. It is incremental in the two ways that
 * matter: a file whose size, mtime and inode are unchanged costs one stat, and a file that
 * only grew is parsed from its last complete line. Everything else is a full re-parse,
 * because a rewritten file means pi rewrote history and guessing is how a chat goes missing.
 *
 * Reads never parse a session file. That is the whole point of the index.
 */

export type SyncResult = {
	readonly added: number;
	readonly removed: number;
	readonly updated: number;
};

export type CatalogApi = {
	readonly sync: (roots: ReadonlyArray<string>) => Effect.Effect<SyncResult>;
	readonly list: Effect.Effect<ReadonlyArray<StoredSummary>>;
	readonly locate: (sessionId: string) => Effect.Effect<StoredSummary | undefined>;
	/** A version per batch that changed rows; the sidebar refetches on it. */
	readonly changes: Stream.Stream<number>;
	/** Reconcile whenever these roots change, for the life of the caller's scope. */
	readonly watch: (
		roots: ReadonlyArray<string>,
	) => Effect.Effect<void, never, FileSystem.FileSystem | Scope.Scope>;
};

export class Catalog extends Context.Service<Catalog, CatalogApi>()("epsilon/Catalog") {}

/** pi writes the header first; a changed head means the file was rewritten, not appended. */
const headLength = 512;

/** The hash of the first bytes; a changed head means the file was rewritten, not appended. */
const headHash = (path: string): Effect.Effect<string | null> =>
	readRangeSync(path, 0, headLength).pipe(
		Effect.map((head) => Bun.hash(head).toString(16)),
		Effect.orElseSucceed(() => null),
	);

export const makeCatalog = (
	db: Database,
	onChanged: (version: number) => void = () => undefined,
	changes: Stream.Stream<number> = Stream.empty,
): CatalogApi => {
	let version = 0;
	/**
	 * Files per slice of a reconcile. A slice runs synchronously, so it decides the longest
	 * the server cannot answer during a cold build; four real session files measure ~60 ms.
	 */
	const SYNC_SLICE_FILES = 4;

	const syncFile = (path: string): Effect.Effect<"added" | "updated" | null, FileUnreadable> =>
		Effect.gen(function* () {
			const stats = yield* statFile(path);
			const previous = rowFor(db, path);
			const unchanged =
				previous !== null &&
				previous.size === stats.size &&
				previous.mtimeNs === stats.mtimeNs &&
				previous.ino === stats.ino;
			if (unchanged) return null;
			const appended =
				previous !== null &&
				previous.ino === stats.ino &&
				stats.size > previous.parsedBytes &&
				previous.parsedBytes > 0 &&
				(yield* headHash(path)) === previous.headHash;
			if (previous !== null && appended) {
				const text = yield* readRangeSync(
					path,
					previous.parsedBytes,
					stats.size - previous.parsedBytes,
				);
				const result = appendToSession(previous, path, text, stats, previous.parsedBytes);
				upsertSession(db, result.summary);
				appendEntries(db, path, result.entries);
				return "updated";
			}
			const text = yield* readTextSync(path);
			const parsed = parseSession(path, text, stats);
			if (parsed === null) {
				deleteSession(db, path);
				return null;
			}
			upsertSession(db, parsed.summary);
			replaceEntries(db, path, parsed.entries);
			return previous === null ? "added" : "updated";
		});

	const sync = (roots: ReadonlyArray<string>): Effect.Effect<SyncResult> =>
		Effect.gen(function* () {
			const files = yield* listJsonl(roots);
			const seen = new Set(files);
			let added = 0;
			let updated = 0;
			let removed = 0;
			// A cold build on the operator's real home reads 1.8 GB of session files — 14.7 s
			// measured — and Effect does not preempt synchronous work, so the socket would
			// answer nothing for all of it. The loop hands control back every few files, so
			// one slice is the longest the server is deaf (tens of milliseconds).
			for (let at = 0; at < files.length; at += SYNC_SLICE_FILES) {
				for (const path of files.slice(at, at + SYNC_SLICE_FILES)) {
					const outcome = yield* syncFile(path).pipe(Effect.orElseSucceed(() => null));
					if (outcome === "added") added++;
					if (outcome === "updated") updated++;
				}
				if (at + SYNC_SLICE_FILES < files.length) yield* Effect.yieldNow;
			}
			for (const path of stalePaths(db, roots)) {
				if (!seen.has(path)) {
					deleteSession(db, path);
					removed++;
				}
			}
			if (added + removed + updated > 0) onChanged(++version);
			return { added, removed, updated };
		});

	const watch = (
		roots: ReadonlyArray<string>,
	): Effect.Effect<void, never, FileSystem.FileSystem | Scope.Scope> =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			yield* Effect.forEach(
				roots,
				(root) =>
					fs.watch(root, { recursive: true }).pipe(
						Stream.debounce("50 millis"),
						Stream.runForEach(() => sync(roots)),
						Effect.ignoreCause,
						Effect.forkScoped,
					),
				{ concurrency: 1 },
			);
		});

	return {
		changes,
		list: Effect.sync(() => allRows(db)),
		locate: (sessionId) => Effect.sync(() => allRows(db).find((row) => row.id === sessionId)),
		sync,
		watch,
	};
};

/**
 * The live catalog: one connection in this process.
 *
 * It stays open for the life of the process. Closing it belongs to the shutdown path in
 * Step 7, which is also where `PRAGMA optimize` runs; SQLite's WAL makes an unclosed
 * handle at process exit safe.
 */
export const CatalogLive = (
	indexPath: string,
	meta: IndexMeta,
): Layer.Layer<Catalog, never, FileSystem.FileSystem> =>
	Layer.effect(
		Catalog,
		Effect.gen(function* () {
			// A home whose .epsilon folder cannot be created is a start-up failure, not a
			// catalog error: there is nothing to fall back to.
			yield* ensureDir(dirname(indexPath)).pipe(Effect.orDie);
			const pubsub = yield* PubSub.unbounded<number>();
			return makeCatalog(
				openIndex(indexPath, meta),
				(version) => {
					PubSub.publishUnsafe(pubsub, version);
				},
				Stream.fromPubSub(pubsub),
			);
		}),
	);
