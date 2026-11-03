import type { AgentSession, SessionEntry, SessionManager } from "@earendil-works/pi-coding-agent";

import type {
	Notice,
	ServerFrame,
	TranscriptEntry,
	TreeEntry,
} from "#protocol/conversation/frames";

import { flatTree, transcriptOf } from "./translate.ts";

/**
 * What a tab receives when it attaches: a window of the branch, not the whole file.
 *
 * The window is bounded twice (rows and bytes) because a 46 MB chat must not become a
 * 46 MB frame. The tree is not here: it is read once when the picker opens, flat, so
 * neither the snapshot nor the schema recurses over 50,000 entries.
 */

export const windowRows = 50;
export const windowBytes = 2 * 1024 * 1024;

export type Window = {
	readonly entries: ReadonlyArray<TranscriptEntry>;
	readonly hasOlder: boolean;
};

type Row = { readonly entry: TranscriptEntry; readonly bytes: number };

const rowBytes = (entry: TranscriptEntry): number => JSON.stringify(entry).length;

const rowsOf = (entries: ReadonlyArray<SessionEntry>): Row[] => {
	const rows: Row[] = [];
	for (const entry of entries) {
		const transcript = transcriptOf(entry);
		if (transcript !== undefined) rows.push({ bytes: rowBytes(transcript), entry: transcript });
	}
	return rows;
};

/**
 * The newest page: stop at the row limit or the byte limit, whichever comes first. A
 * single oversized row is still sent (already cut to 64 KB), so the page always has the
 * last message.
 */
const pageAt = (rows: ReadonlyArray<Row>, endExclusive: number): Window => {
	let index = endExclusive - 1;
	let bytes = 0;
	let count = 0;
	while (index >= 0) {
		const row = rows[index];
		if (row === undefined) break;
		const nextBytes = bytes + row.bytes;
		const over = count >= windowRows || (count > 0 && nextBytes > windowBytes);
		if (over) break;
		bytes = nextBytes;
		count++;
		index--;
	}
	const entries: TranscriptEntry[] = [];
	for (let at = index + 1; at < endExclusive; at++) {
		const row = rows[at];
		if (row !== undefined) entries.push(row.entry);
	}
	return { entries, hasOlder: index >= 0 };
};

export const snapshotWindow = (agent: AgentSession): Window => {
	const rows = rowsOf(agent.sessionManager.buildContextEntries());
	return pageAt(rows, rows.length);
};

/** The page before `before`, for a tab that scrolled to the top of what it has. */
export const historyWindow = (agent: AgentSession, before: string): Window | undefined => {
	const rows = rowsOf(agent.sessionManager.buildContextEntries());
	const index = rows.findIndex((row) => row.entry.id === before);
	if (index < 0) return undefined;
	return pageAt(rows, index);
};

/** Compaction and branch summaries are rows the wire shows as notices. */
export const noticesOf = (sessionManager: SessionManager): Notice[] => {
	const notices: Notice[] = [];
	for (const entry of sessionManager.buildContextEntries()) {
		if (entry.type === "compaction") {
			notices.push({
				afterEntryId: entry.parentId,
				id: entry.id,
				kind: "compaction",
				text: entry.summary,
			});
		}
		if (entry.type === "branch_summary") {
			notices.push({
				afterEntryId: entry.parentId,
				id: entry.id,
				kind: "notice",
				text: entry.summary,
			});
		}
	}
	return notices;
};

/** The branch tree, flat, with the branch the page shows marked. */
export const treeOf = (sessionManager: SessionManager): TreeEntry[] => {
	const onPath = new Set(sessionManager.getBranch().map((entry) => entry.id));
	return flatTree(sessionManager.getTree(), onPath);
};

type MutableSessionMeta = {
	sessionId: string;
	t: "sessionMeta";
	title?: string;
	model?: string;
};

export const sessionMeta = (agent: AgentSession): Extract<ServerFrame, { t: "sessionMeta" }> => {
	const title = agent.sessionManager.getSessionName();
	const model = agent.model === undefined ? undefined : `${agent.model.provider}/${agent.model.id}`;
	const frame: MutableSessionMeta = { sessionId: agent.sessionId, t: "sessionMeta" };
	if (title !== undefined) frame.title = title;
	if (model !== undefined) frame.model = model;
	return frame;
};
