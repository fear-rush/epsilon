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

export type ToolRun = {
	toolCallId: string;
	toolName: string;
	args: ToolCallArguments | undefined;
	/** Text the tool has streamed so far, or its final output. */
	output: string;
	images: ToolResultPart[];
	/** `pending` means a tool call with no execution event: never blank, never a guess. */
	status: "pending" | "running" | "ok" | "error";
	durationMs?: number;
};

/** Assistant text that has arrived but has no authoritative message yet. */
export type StreamingTurn = {
	text: string;
	thinking: string;
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
	/** A turn is in progress. `agent_start` and `agent_end` carry this; a live
	 * engine that is merely idle does not. */
	busy: boolean;
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
	/** Whether the tools that run commands and change files are active. */
	codingTools: boolean;
	/** How full the context window is now, or absent while pi cannot tell. */
	contextUsage: ContextUsage | undefined;
	/** What the session has spent over its whole history, from the last snapshot. */
	stats: SessionStats;
	/** An automatic retry is waiting to run again after a failed request. */
	isRetrying: boolean;
	isBashRunning: boolean;
	/** pi's two automatic settings; both are on in pi's defaults (settings-defaults.js). */
	autoCompaction: boolean;
	autoRetry: boolean;
	/** Prompts pi holds for the run that is already going. */
	queue: PromptQueue;
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
	models: [],
	commands: [],
	model: undefined,
	thinkingLevel: "off",
	availableThinkingLevels: [],
	place: undefined,
	codingTools: false,
	contextUsage: undefined,
	stats: noStats,
	isRetrying: false,
	isBashRunning: false,
	autoCompaction: true,
	autoRetry: true,
	queue: { steering: [], followUp: [] },
	nextNoticeId: 0,
};
