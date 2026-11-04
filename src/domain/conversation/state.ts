import type { DialogQuestion } from "#protocol/conversation/extui";
import type { Notice, TranscriptEntry, TreeEntry } from "#protocol/conversation/frames";
import type { ThinkingLevel } from "#protocol/conversation/session";

/** Text or thinking that has streamed but has no entry yet. */
export type StreamingBlock = { readonly kind: "text" | "thinking"; readonly text: string };

/**
 * One assistant message arriving before `append`. Deltas carry a block index, so text,
 * thinking and text interleave the way the model wrote them.
 */
export type StreamingTurn = {
	readonly streamId: string;
	readonly blocks: ReadonlyArray<StreamingBlock | undefined>;
};

/** A tool call and what it has produced so far, keyed by pi's own tool call id. */
export type ToolRun = {
	readonly toolCallId: string;
	readonly toolName: string;
	/** The assistant entry that made the call, so its card can be drawn in place. */
	readonly entryId: string;
	readonly args: unknown;
	readonly output: string;
	readonly status: "running" | "ok" | "error";
	readonly durationMs: number | undefined;
};

/**
 * What the page shows for one chat. Every row is reachable by an id that outlives the
 * window: entry ids, tool call ids, dialog ids. No array index is ever a key.
 */
export type ConversationState = {
	readonly sessionId: string | undefined;
	readonly title: string | undefined;
	readonly model: string | undefined;
	readonly thinking: ThinkingLevel | undefined;
	/** The tools pi declares to the model now, by name. */
	readonly activeTools: ReadonlyArray<string>;
	/** Text pi put back in the composer; the nonce marks a new insertion. */
	readonly draft: { readonly text: string; readonly nonce: string } | undefined;
	readonly entries: ReadonlyArray<TranscriptEntry>;
	readonly streaming: ReadonlyArray<StreamingTurn>;
	readonly tools: ReadonlyArray<ToolRun>;
	readonly notices: ReadonlyArray<Notice>;
	readonly dialogs: ReadonlyArray<DialogQuestion>;
	readonly tree: ReadonlyArray<TreeEntry>;
	readonly busy: boolean;
	readonly compacting: boolean;
	readonly hasOlder: boolean;
	/** Set when the session file changed outside Epsilon; the chat is read-only until reload. */
	readonly drift: string | undefined;
};

/** A looping extension must not grow the transcript forever. Oldest notices fall off first. */
export const noticeLimit = 200;

export const emptyConversation: ConversationState = {
	sessionId: undefined,
	title: undefined,
	model: undefined,
	thinking: undefined,
	activeTools: [],
	draft: undefined,
	entries: [],
	streaming: [],
	tools: [],
	notices: [],
	dialogs: [],
	tree: [],
	busy: false,
	compacting: false,
	hasOlder: false,
	drift: undefined,
};
