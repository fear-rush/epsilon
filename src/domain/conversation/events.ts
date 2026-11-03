import type { Notice } from "#protocol/conversation/frames";

import type { ConversationState, StreamingBlock, StreamingTurn, ToolRun } from "./state.ts";
import { noticeLimit } from "./state.ts";

/**
 * The small pure edits the reducer composes. Each one takes the state it changes and
 * returns a new one; none of them reads a clock, a file or a random source.
 */

/** Appends a notice, dropping the oldest once the cap is reached. */
export function withNotice(state: ConversationState, notice: Notice): ConversationState {
	const notices = [...state.notices, notice].slice(-noticeLimit);
	return { ...state, notices };
}

/** Appends a delta at its block index, creating the block on its first delta. */
export function appendStreamingDelta(
	turn: StreamingTurn,
	blockIndex: number,
	kind: StreamingBlock["kind"],
	delta: string,
): StreamingTurn {
	const blocks = [...turn.blocks];
	while (blocks.length <= blockIndex) blocks.push(undefined);
	const current = blocks[blockIndex];
	blocks[blockIndex] =
		current === undefined || current.kind !== kind
			? { kind, text: delta }
			: { kind, text: current.text + delta };
	return { ...turn, blocks };
}

/** Inserts or updates a tool run, preserving the order the calls were first seen in. */
export function upsertTool(tools: ReadonlyArray<ToolRun>, next: ToolRun): ReadonlyArray<ToolRun> {
	const index = tools.findIndex((tool) => tool.toolCallId === next.toolCallId);
	if (index === -1) return [...tools, next];
	return tools.map((tool, at) => (at === index ? { ...tool, ...next } : tool));
}

/** Prepends an older page, skipping entries the window already holds. */
export function prependEntries<T extends { readonly id: string }>(
	entries: ReadonlyArray<T>,
	older: ReadonlyArray<T>,
): ReadonlyArray<T> {
	const known = new Set(entries.map((entry) => entry.id));
	return [...older.filter((entry) => !known.has(entry.id)), ...entries];
}

/** Appends one entry, replacing an entry with the same id instead of duplicating it. */
export function appendEntry<T extends { readonly id: string }>(
	entries: ReadonlyArray<T>,
	entry: T,
): ReadonlyArray<T> {
	const index = entries.findIndex((existing) => existing.id === entry.id);
	if (index === -1) return [...entries, entry];
	return entries.map((existing, at) => (at === index ? entry : existing));
}
