import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * pi session fixtures: real JSONL lines in pi's v3 session format, so the catalog, the
 * index and the engine read them without a special path.
 *
 * Header shape: `{ type: "session", version, id, timestamp, cwd }` and every entry is
 * `{ type, id, parentId, timestamp, ... }`. pi truncates nothing here, so a generator can
 * produce a linear, branched or damaged file exactly as a crash would leave it.
 *
 * Timestamps are fixed: a generator that read the clock would make a failing test
 * unreproducible.
 */

export const sessionVersion = 3;
const firstTimestamp = Date.UTC(2026, 0, 1, 0, 0, 0);

type Block = { readonly type: "text"; readonly text: string };

export type MessageEntry = {
	readonly type: "message";
	readonly id: string;
	readonly parentId: string | null;
	readonly timestamp: string;
	readonly message: {
		readonly role: "user" | "assistant" | "toolResult";
		readonly content: ReadonlyArray<Block>;
		readonly toolCallId?: string;
		readonly toolName?: string;
		readonly isError?: boolean;
	};
};

export type SessionEntry =
	| MessageEntry
	| {
			readonly type: "session_info";
			readonly id: string;
			readonly parentId: string | null;
			readonly timestamp: string;
			readonly name: string;
	  }
	| {
			readonly type: "compaction";
			readonly id: string;
			readonly parentId: string | null;
			readonly timestamp: string;
			readonly summary: string;
			readonly firstKeptEntryId: string;
			readonly tokensBefore: number;
	  }
	| {
			readonly type: "branch_summary";
			readonly id: string;
			readonly parentId: string | null;
			readonly timestamp: string;
			readonly fromId: string;
			readonly summary: string;
	  };

const at = (index: number): string => new Date(firstTimestamp + index * 1000).toISOString();

export function sessionHeader(id: string, cwd: string): string {
	return JSON.stringify({
		type: "session",
		version: sessionVersion,
		id,
		timestamp: at(0),
		cwd,
		parentSession: undefined,
	});
}

export function userEntry(
	id: string,
	parentId: string | null,
	text: string,
	index = 1,
): MessageEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp: at(index),
		message: { role: "user", content: [{ type: "text", text }] },
	};
}

export function assistantEntry(
	id: string,
	parentId: string | null,
	text: string,
	index = 2,
): MessageEntry {
	return {
		type: "message",
		id,
		parentId,
		timestamp: at(index),
		message: { role: "assistant", content: [{ type: "text", text }] },
	};
}

export function toolResultEntry(
	id: string,
	parentId: string | null,
	output: string,
	options: {
		readonly toolCallId?: string;
		readonly toolName?: string;
		readonly isError?: boolean;
		readonly index?: number;
	} = {},
): MessageEntry {
	const message: MessageEntry["message"] = {
		role: "toolResult",
		toolCallId: options.toolCallId ?? `call-${id}`,
		toolName: options.toolName ?? "bash",
		isError: options.isError ?? false,
		content: [{ type: "text", text: output }],
	};
	return {
		type: "message",
		id,
		parentId,
		timestamp: at(options.index ?? 3),
		message: {
			...message,
			...(options.toolName === undefined ? undefined : { toolName: options.toolName }),
			...(options.isError === undefined ? undefined : { isError: options.isError }),
		},
	};
}

const lines = (header: string, entries: ReadonlyArray<SessionEntry>): string =>
	`${[header, ...entries.map((entry) => JSON.stringify(entry))].join("\n")}\n`;

/** The path pi itself would use: `<timestamp with dashes>_<id>.jsonl`. */
export function sessionPath(dir: string, id: string, timestampIso = at(0)): string {
	const fileTimestamp = timestampIso.replaceAll(/[:.]/g, "-");
	return join(dir, `${fileTimestamp}_${id}.jsonl`);
}

export function writeSession(dir: string, id: string, text: string): string {
	mkdirSync(dir, { recursive: true });
	const path = sessionPath(dir, id);
	writeFileSync(path, text);
	return path;
}

/** A chat of `count` entries: user, assistant, tool result, repeating. */
export function linearSession(id: string, cwd: string, count: number): string {
	const entries: SessionEntry[] = [];
	let parentId: string | null = null;
	for (let index = 0; index < count; index++) {
		const entryId = `e${String(index).padStart(6, "0")}`;
		const role = index % 3;
		const entry =
			role === 0
				? userEntry(entryId, parentId, `prompt ${index}`, index)
				: role === 1
					? assistantEntry(entryId, parentId, `answer ${index}`, index)
					: toolResultEntry(entryId, parentId, `output ${index}`, { index });
		entries.push(entry);
		parentId = entryId;
	}
	return lines(sessionHeader(id, cwd), entries);
}

/** Two children at one entry: a branch, which the tree view and the reducer must keep. */
export function branchedSession(id: string, cwd: string): string {
	const root = assistantEntry("e2", "e1", "root answer", 2);
	return lines(sessionHeader(id, cwd), [
		userEntry("e1", null, "branch here", 1),
		root,
		assistantEntry("e3", "e2", "left", 3),
		toolResultEntry("e4", "e2", "right", { index: 4 }),
	]);
}

/** A compaction entry sitting between kept entries. */
export function compactedSession(id: string, cwd: string): string {
	return lines(sessionHeader(id, cwd), [
		userEntry("e1", null, "first", 1),
		assistantEntry("e2", "e1", "kept answer", 2),
		{
			type: "compaction",
			id: "e3",
			parentId: "e2",
			timestamp: at(3),
			summary: "earlier work",
			firstKeptEntryId: "e2",
			tokensBefore: 1234,
		},
		userEntry("e4", "e3", "after compaction", 4),
	]);
}

/** A rename, which the catalog reads from `session_info`. */
export function renamedSession(id: string, cwd: string, name: string): string {
	return lines(sessionHeader(id, cwd), [
		userEntry("e1", null, "hello", 1),
		{ type: "session_info", id: "e2", parentId: "e1", timestamp: at(2), name },
	]);
}

/** One tool result larger than the frame budget, for paging and transcript tests. */
export function hugeToolOutputSession(id: string, cwd: string, bytes: number): string {
	return lines(sessionHeader(id, cwd), [
		userEntry("e1", null, "run it", 1),
		assistantEntry("e2", "e1", "running", 2),
		toolResultEntry("e3", "e2", "x".repeat(bytes), { toolName: "bash", index: 3 }),
	]);
}

/** A crash mid-write: the last line is a partial JSON object with no newline. */
export function halfWrittenSession(id: string, cwd: string): string {
	const complete = lines(sessionHeader(id, cwd), [userEntry("e1", null, "started", 1)]);
	return `${complete}{"type":"message","id":"e2","parentId":"e1","timestamp":"2026-01-01T00:00:02.000Z","mess`;
}

/** A file whose header was rewritten (a migration or branch rewrite kept the entries). */
export function rewrittenHeadSession(id: string, cwd: string): string {
	const rewritten = JSON.stringify({
		type: "session",
		version: sessionVersion,
		id,
		timestamp: at(0),
		cwd: `${cwd}-moved`,
		parentSession: "older",
	});
	return lines(rewritten, [
		userEntry("e1", null, "after rewrite", 1),
		assistantEntry("e2", "e1", "still here", 2),
	]);
}

/** 50,000 linear entries, the depth the old recursive tree schema overflowed on. */
export function fiftyThousand(id: string, cwd: string): string {
	return linearSession(id, cwd, 50_000);
}
