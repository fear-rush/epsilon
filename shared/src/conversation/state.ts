/**
 * What the browser shows. Built only from socket frames, so replaying a fixture
 * twice produces the same state.
 */
import type { DialogQuestion } from "../protocol/extui";
import type { JsonAgentSessionEvent } from "../pi";
import type {
	ContextUsage,
	Place,
	PromptQueue,
	SessionStats,
	SnapshotCommand,
	SnapshotModel,
	SnapshotTreeNode,
	ThinkingLevel,
} from "../protocol/frames";

type EventMessage = Extract<JsonAgentSessionEvent, { type: "message_end" }>["message"];

/** pi's messages without the system prompt, which is never shown. */
export type ConversationMessage = Exclude<EventMessage, { role: "system" }>;

/**
 * What `get_messages` returns: the transcript plus system messages. Its reply is
 * typed wider than the wire event, so the system entries are filtered at the edge
 * instead of being shipped to the browser.
 */
export type SnapshotMessage = ConversationMessage | { role: "system"; timestamp?: number };

export const isVisibleMessage = (message: SnapshotMessage): message is ConversationMessage =>
	message.role !== "system";

type AssistantContent = Extract<ConversationMessage, { role: "assistant" }>["content"][number];

type ToolCallArguments = Extract<AssistantContent, { type: "toolCall" }>["arguments"];

type ToolResultPart = Extract<
	Extract<ConversationMessage, { role: "toolResult" }>["content"][number],
	{ type: "image" }
>;

/**
 * A call a tool made while it ran (`ctx.executeTool()`), as pi records it on the
 * calling tool's result. pi bounds this record: arguments over its size limit are
 * omitted, and a call still running when its parent finished is `unfinished`.
 */
export type NestedToolRun = {
	toolCallId: string;
	toolName: string;
	args?: ToolCallArguments;
	status: "ok" | "error" | "unfinished";
	durationMs?: number;
	/** pi's own error text, truncated by pi. */
	error?: string;
};

export type ToolRun = {
	toolCallId: string;
	toolName: string;
	args: ToolCallArguments | undefined;
	/** Text the tool has streamed so far, or its final output. */
	output: string;
	images: ToolResultPart[];
	/** `pending` means a tool call with no execution event: never blank, never a guess. */
	status: "pending" | "running" | "ok" | "error";
	/** Why the row has this status when the tool never said: a run that ended, for one. */
	note?: string;
	durationMs?: number;
	/** The call that made this one, on a run that is streaming from a nested event. */
	parentToolCallId?: string;
	/** Calls this tool made, which its own card draws instead of a top-level row. */
	nested?: NestedToolRun[];
};

/** Assistant text that has arrived but has no authoritative message yet. */
export type StreamingBlock =
	| { type: "text"; text: string }
	| { type: "thinking"; thinking: string };

/**
 * One assistant content block arriving before `message_end`, at pi's own
 * `contentIndex`. A tool call's index stays empty: its row is the tool card.
 * Keeping the index is what lets text, thinking and text render in that order.
 */
export type StreamingTurn = {
	blocks: (StreamingBlock | undefined)[];
};

export type Notice = {
	id: number;
	kind: "compaction" | "retry" | "notice" | "error";
	text: string;
	/** How many messages had arrived when this notice happened, for ordering. */
	afterMessages: number;
};

/** A keyed status string an extension set, such as the permission state. */
export type UiStatus = { key: string; text: string };

/** A `!cmd` this process is running, and the output it has written so far. */
type BashRun = {
	/** pi's id for the run, so a delta cannot land in the previous command's output. */
	id: string | undefined;
	output: string;
};

/** Keyed widget lines an extension set, placed around the composer. */
export type UiWidget = { key: string; placement: "aboveEditor" | "belowEditor"; lines: string[] };

export type ConversationState = {
	messages: ConversationMessage[];
	tools: ToolRun[];
	streaming: StreamingTurn | null;
	notices: Notice[];
	/** Extension questions that still block the agent. */
	dialogs: DialogQuestion[];
	/** Extension display state that is still set, replayed on attach. */
	statuses: UiStatus[];
	widgets: UiWidget[];
	/** Set by an extension through `setTitle`. */
	title?: string;
	/** pi's own session name, from `set_session_name` or the terminal. */
	sessionName?: string;
	/** A turn is in progress. `agent_start` starts it and `agent_settled` ends it;
	 * `agent_end` still has cleanup to do, so it does not. */
	busy: boolean;
	/** pi is replacing the transcript with a summary. */
	isCompacting: boolean;
	/** A change made to this chat's file by another process, until a reload or a new snapshot. */
	drift?: string;
	/** What the model picker may offer, from the last snapshot. */
	models: SnapshotModel[];
	/** What `/` may expand to, from the last snapshot's `get_commands`. */
	commands: SnapshotCommand[];
	/** The model the session uses now, or undefined before the first snapshot. */
	model: SnapshotModel | undefined;
	/** The level pi is currently using, and the levels this model offers. */
	thinkingLevel: ThinkingLevel;
	availableThinkingLevels: ThinkingLevel[];
	/** Where the session runs, or undefined before the first snapshot. */
	place: Place | undefined;
	/** Whether pi hides thinking blocks; its global `hideThinkingBlock` setting. */
	hideThinkingBlock: boolean;
	/** Whether the tools that run commands and change files are active. */
	codingTools: boolean;
	/** How full the context window is now, or absent while pi cannot tell. */
	contextUsage: ContextUsage | undefined;
	/** What the session has spent over its whole history, from the last snapshot. */
	stats: SessionStats;
	/** An automatic retry is waiting to run again after a failed request. */
	isRetrying: boolean;
	isBashRunning: boolean;
	/** The `!cmd` in flight, if this tab has seen any of its output. */
	bash: BashRun | null;
	/** pi's two automatic settings; both are on in pi's defaults (settings-defaults.js). */
	autoCompaction: boolean;
	autoRetry: boolean;
	/** Prompts pi holds for the run that is already going. */
	queue: PromptQueue;
	/** The session tree the picker draws, from the last snapshot. */
	tree: SnapshotTreeNode[];
	nextNoticeId: number;
};

const noStats: SessionStats = {
	tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	cost: 0,
	userMessages: 0,
	assistantMessages: 0,
	toolCalls: 0,
	totalMessages: 0,
};

export const emptyConversation: ConversationState = {
	messages: [],
	tools: [],
	streaming: null,
	notices: [],
	dialogs: [],
	statuses: [],
	widgets: [],
	busy: false,
	isCompacting: false,
	models: [],
	commands: [],
	model: undefined,
	thinkingLevel: "off",
	availableThinkingLevels: [],
	place: undefined,
	hideThinkingBlock: false,
	codingTools: false,
	contextUsage: undefined,
	stats: noStats,
	isRetrying: false,
	isBashRunning: false,
	bash: null,
	autoCompaction: true,
	autoRetry: true,
	queue: { steering: [], followUp: [] },
	tree: [],
	nextNoticeId: 0,
};
