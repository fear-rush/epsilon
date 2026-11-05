import type { DialogQuestion, UiStatus, UiWidget } from "#protocol/conversation/extui";
import type {
	ImageBlock,
	Notice,
	TranscriptEntry,
	TreeFilterMode,
} from "#protocol/conversation/frames";
import type { CommandOffer } from "#protocol/conversation/palette";
import type { ThinkingLevel } from "#protocol/conversation/session";
import type { CacheWarming, ContextUsage, SessionStats } from "#protocol/usage";

import type { SnapshotTreeNode } from "./tree.ts";

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
/** The shell command a chat is running, with the output pi has streamed so far. */
export type BashRun = {
	readonly command: string;
	readonly output: string;
	readonly running: boolean;
};

/** What pi holds for the next turn: steering messages and follow-ups, in pi's order. */
export type Queue = {
	readonly steering: ReadonlyArray<string>;
	readonly followUp: ReadonlyArray<string>;
};

/** The composer's readings: pi's window, totals and warmer, from one frame. */
export type Readings = {
	readonly contextUsage: ContextUsage | undefined;
	readonly stats: SessionStats;
	readonly cacheWarming: CacheWarming | undefined;
};

export type ToolRun = {
	readonly toolCallId: string;
	readonly toolName: string;
	/** The assistant entry that made the call, so its card can be drawn in place. */
	readonly entryId: string;
	readonly args: unknown;
	readonly output: string;
	/** Images the tool returned, which its own card draws. */
	readonly images: ReadonlyArray<ImageBlock>;
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
	/** The branch tree, nested as the picker draws it; read when the picker opens. */
	readonly tree: ReadonlyArray<SnapshotTreeNode>;
	/** pi's default tree filter, from its own settings file. */
	readonly treeFilterMode: TreeFilterMode;
	readonly busy: boolean;
	readonly compacting: boolean;
	readonly retrying: boolean;
	readonly queue: Queue;
	readonly bash: BashRun;
	/** What pi reports about the session: the window, its totals and the cache warmer. */
	readonly readings: Readings | undefined;
	/** One line per extension that set a keyed status; the permission mode has its own menu. */
	readonly statuses: ReadonlyArray<UiStatus>;
	/** The text blocks extensions put above or below the composer, keyed like the statuses. */
	readonly widgets: ReadonlyArray<UiWidget>;
	/** pi's automatic behaviours, which its own settings file owns. */
	readonly autoCompaction: boolean;
	readonly autoRetry: boolean;
	readonly hideThinking: boolean;
	/** Whether pi's coding tools are declared now, and the thinking levels it offers. */
	readonly codingTools: boolean;
	readonly thinkingLevels: ReadonlyArray<ThinkingLevel>;
	/** What `/` offers in this chat: the builtin table, pi's commands, templates and skills. */
	readonly commands: ReadonlyArray<CommandOffer>;
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
	treeFilterMode: "default",
	busy: false,
	compacting: false,
	retrying: false,
	queue: { followUp: [], steering: [] },
	bash: { command: "", output: "", running: false },
	readings: undefined,
	statuses: [],
	widgets: [],
	autoCompaction: false,
	autoRetry: false,
	hideThinking: false,
	codingTools: false,
	thinkingLevels: [],
	commands: [],
	hasOlder: false,
	drift: undefined,
};
