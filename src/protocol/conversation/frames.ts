import { Schema } from "effect";

import { ThinkingLevel } from "./session.ts";

/**
 * What the engine sends the page about one chat.
 *
 * Two rules shaped this file:
 *
 * 1. Every row is keyed by a value that outlives it: a session entry id, a tool call id,
 *    a dialog id. There are no array indexes, so a window that starts mid-history cannot
 *    renumber the rows the page already shows.
 * 2. The transcript arrives as a window plus older pages, and the tree arrives flat. A
 *    recursive schema over 50,000 entries overflows the stack, and a whole transcript in
 *    one frame is what made the old socket send 46 MB.
 */

export const EntryRole = Schema.Literals(["user", "assistant", "toolResult"]);
export type EntryRole = typeof EntryRole.Type;

export const TextBlock = Schema.Struct({ type: Schema.Literals(["text"]), text: Schema.String });
export const ThinkingBlock = Schema.Struct({
	type: Schema.Literals(["thinking"]),
	thinking: Schema.String,
});
export const ToolCallBlock = Schema.Struct({
	type: Schema.Literals(["toolCall"]),
	toolCallId: Schema.String,
	toolName: Schema.String,
	args: Schema.Unknown,
});
export const ImageBlock = Schema.Struct({
	type: Schema.Literals(["image"]),
	data: Schema.String,
	mimeType: Schema.String,
});
export type ImageBlock = typeof ImageBlock.Type;

export const AssistantBlock = Schema.Union([TextBlock, ThinkingBlock, ToolCallBlock]);
export type AssistantBlock = typeof AssistantBlock.Type;

export const ToolResultBlock = Schema.Union([TextBlock, ImageBlock]);
export type ToolResultBlock = typeof ToolResultBlock.Type;

/** The base fields every transcript row shares; `role` decides what else it holds. */
const entryBase = {
	id: Schema.String,
	parentId: Schema.NullOr(Schema.String),
	ts: Schema.Finite,
} as const;

export const UserEntry = Schema.Struct({
	...entryBase,
	role: Schema.Literals(["user"]),
	text: Schema.String,
	images: Schema.Array(ImageBlock),
});

export const AssistantEntry = Schema.Struct({
	...entryBase,
	role: Schema.Literals(["assistant"]),
	blocks: Schema.Array(AssistantBlock),
});
export type AssistantEntry = typeof AssistantEntry.Type;

export const ToolResultEntry = Schema.Struct({
	...entryBase,
	role: Schema.Literals(["toolResult"]),
	toolCallId: Schema.String,
	toolName: Schema.String,
	isError: Schema.Boolean,
	output: Schema.String,
	images: Schema.Array(ImageBlock),
});
export type ToolResultEntry = typeof ToolResultEntry.Type;

export const TranscriptEntry = Schema.Union([UserEntry, AssistantEntry, ToolResultEntry]);
export type TranscriptEntry = typeof TranscriptEntry.Type;

/** What the tree picker needs per row. `onPath` marks the root-to-leaf path. */
export const TreeEntryKind = Schema.Literals([
	"user",
	"assistant",
	"toolResult",
	"compaction",
	"branchSummary",
	"sessionInfo",
	"other",
]);

export const TreeEntry = Schema.Struct({
	id: Schema.String,
	parentId: Schema.NullOr(Schema.String),
	kind: TreeEntryKind,
	label: Schema.String,
	ts: Schema.Finite,
	onPath: Schema.Boolean,
});
export type TreeEntry = typeof TreeEntry.Type;

export const NoticeKind = Schema.Literals(["notice", "warning", "error", "compaction", "retry"]);
export type NoticeKind = typeof NoticeKind.Type;

export const Notice = Schema.Struct({
	/** Stable for the life of the frame stream, so the page can dismiss one by id. */
	id: Schema.String,
	kind: NoticeKind,
	text: Schema.String,
	/** The entry the notice followed, or null before any. An id, never an index. */
	afterEntryId: Schema.NullOr(Schema.String),
});
export type Notice = typeof Notice.Type;

export const StreamingBlockKind = Schema.Literals(["text", "thinking"]);
export type StreamingBlockKind = typeof StreamingBlockKind.Type;

/** The same window, older: what "load earlier messages" asks for and receives. */
export const PrependFrame = Schema.Struct({
	t: Schema.Literals(["prepend"]),
	entries: Schema.Array(TranscriptEntry),
	hasOlder: Schema.Boolean,
});

export const AppendFrame = Schema.Struct({
	t: Schema.Literals(["append"]),
	entry: TranscriptEntry,
	/**
	 * The streaming row this entry completes. The page drops that row and shows the
	 * entry, so a message is never drawn twice.
	 */
	streamId: Schema.optional(Schema.String),
});

export const SnapshotFrame = Schema.Struct({
	t: Schema.Literals(["snapshot"]),
	sessionId: Schema.String,
	entries: Schema.Array(TranscriptEntry),
	hasOlder: Schema.Boolean,
	notices: Schema.Array(Notice),
	/** The same state without replaying frames: what a stale tab asks for after a reconnect. */
	resync: Schema.optional(Schema.Boolean),
});

/**
 * The branch tree, flat, when a tab opens the picker. 50,000 entries at snapshot time would
 * blow the frame budget, and the tree is not read on every render, so it travels on request.
 */
export const TreeFrame = Schema.Struct({
	t: Schema.Literals(["tree"]),
	entries: Schema.Array(TreeEntry),
});

/** Text or thinking arriving before the message is appended. Keyed by the stream id. */
export const StreamingFrame = Schema.Struct({
	t: Schema.Literals(["streaming"]),
	streamId: Schema.String,
	blockIndex: Schema.Finite,
	kind: StreamingBlockKind,
	delta: Schema.String,
});

export const StreamingEndFrame = Schema.Struct({
	t: Schema.Literals(["streamingEnd"]),
	streamId: Schema.String,
});

export const ToolDeltaFrame = Schema.Struct({
	t: Schema.Literals(["toolDelta"]),
	toolCallId: Schema.String,
	entryId: Schema.String,
	toolName: Schema.String,
	status: Schema.Literals(["running", "ok", "error"]),
	/** The whole output so far, which is what pi sends; the reducer replaces, never adds. */
	output: Schema.optional(Schema.String),
	durationMs: Schema.optional(Schema.Finite),
});

export const NoticeFrame = Schema.Struct({
	t: Schema.Literals(["notice"]),
	id: Schema.String,
	kind: NoticeKind,
	text: Schema.String,
});

export const DialogFrame = Schema.Struct({
	t: Schema.Literals(["dialog"]),
	question: Schema.Unknown,
});

export const DialogClosedFrame = Schema.Struct({
	t: Schema.Literals(["dialogClosed"]),
	id: Schema.String,
});

export const BusyFrame = Schema.Struct({
	t: Schema.Literals(["busy"]),
	busy: Schema.Boolean,
	compacting: Schema.optional(Schema.Boolean),
});

/** Something outside Epsilon wrote the session file; the chat is read-only until reloaded. */
export const DriftFrame = Schema.Struct({
	t: Schema.Literals(["drift"]),
	reason: Schema.String,
});

export const SessionMetaFrame = Schema.Struct({
	t: Schema.Literals(["sessionMeta"]),
	sessionId: Schema.String,
	title: Schema.optional(Schema.String),
	model: Schema.optional(Schema.String),
	thinking: Schema.optional(ThinkingLevel),
	/** The tools declared to the model now, by name. */
	tools: Schema.optional(Schema.Array(Schema.String)),
});

/**
 * Text pi put back in the composer, such as the user message a tree move restored. The
 * nonce tells the page this is a new insertion, not the draft it reported itself.
 */
export const EditorTextFrame = Schema.Struct({
	t: Schema.Literals(["editorText"]),
	text: Schema.String,
	nonce: Schema.String,
});

export const ServerFrame = Schema.Union([
	SnapshotFrame,
	PrependFrame,
	AppendFrame,
	StreamingFrame,
	StreamingEndFrame,
	ToolDeltaFrame,
	NoticeFrame,
	DialogFrame,
	DialogClosedFrame,
	BusyFrame,
	DriftFrame,
	SessionMetaFrame,
	EditorTextFrame,
	TreeFrame,
]);
export type ServerFrame = typeof ServerFrame.Type;

/** Decodes one frame from the socket, and fails the same way on every side. */
export const decodeServerFrame = Schema.decodeUnknownSync(ServerFrame);
