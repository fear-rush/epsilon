import type { AssistantEntry, TranscriptEntry } from "#protocol/conversation/frames";

import { assistantText } from "./content.ts";
import type { ConversationState, StreamingTurn, ToolRun } from "./state.ts";

/**
 * Read-only views over `ConversationState`. They are pure and derive nothing the reducer
 * does not already hold, so a component that needs a different grouping asks for a new
 * selector instead of re-walking the arrays in render.
 */

export type TranscriptRow =
	| { readonly kind: "entry"; readonly id: string; readonly entry: TranscriptEntry }
	| { readonly kind: "streaming"; readonly id: string; readonly turn: StreamingTurn };

/**
 * The transcript in display order: entries as they arrived, then the message that is still
 * streaming. A streaming row keeps its own id until `append` replaces it.
 */
export function transcript(state: ConversationState): ReadonlyArray<TranscriptRow> {
	const rows: TranscriptRow[] = state.entries.map((entry) => ({
		kind: "entry",
		id: entry.id,
		entry,
	}));
	for (const turn of state.streaming) rows.push({ kind: "streaming", id: turn.streamId, turn });
	return rows;
}

/** The tool runs an assistant entry started, in call order. */
export function toolRunsFor(state: ConversationState, entryId: string): ReadonlyArray<ToolRun> {
	return state.tools.filter((tool) => tool.entryId === entryId);
}

/** The tool run a tool-result entry belongs to, if its call is in the window. */
export function toolRunOf(state: ConversationState, toolCallId: string): ToolRun | undefined {
	return state.tools.find((tool) => tool.toolCallId === toolCallId);
}

export function entryById(state: ConversationState, id: string): TranscriptEntry | undefined {
	return state.entries.find((entry) => entry.id === id);
}

/** A chat is writable unless something outside Epsilon changed its file. */
export function isWritable(state: ConversationState): boolean {
	return state.drift === undefined;
}

/** The assistant text a collapsed row shows, or the notice that stands in for one. */
export function lastAssistantText(state: ConversationState): string | undefined {
	const last = state.entries.findLast(
		(entry): entry is AssistantEntry => entry.role === "assistant",
	);
	return last === undefined ? undefined : assistantText(last);
}
