import { Schema } from "effect";

import { CacheWarming, ContextUsage, SessionStats } from "../usage.ts";
import { UiStatus, UiWidget } from "./extui.ts";
import { CommandOffer } from "./palette.ts";
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
	/**
	 * The model's arguments for the call, which are JSON; every tool decodes its own. pi
	 * writes them on every call, but a file another writer left can lack them.
	 */
	args: Schema.optional(Schema.Json),
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

/**
 * A compaction or a branch summary: pi's own block where it replaced the history. It keeps
 * pi's label (how much it replaced) and the summary text, which is content, not a notice.
 */
export const SummaryEntry = Schema.Struct({
	...entryBase,
	role: Schema.Literals(["summary"]),
	label: Schema.String,
	text: Schema.String,
});
export type SummaryEntry = typeof SummaryEntry.Type;

export const TranscriptEntry = Schema.Union([
	UserEntry,
	AssistantEntry,
	ToolResultEntry,
	SummaryEntry,
]);
export type TranscriptEntry = typeof TranscriptEntry.Type;

/** The five kinds pi's picker names a row by. */
export const TreeRowKind = Schema.Literals(["user", "assistant", "summary", "tool", "settings"]);

/**
 * One pickable row of the branch tree, flat.
 *
 * The wire carries rows, not a tree: a 50,000-entry chat must not recurse through a
 * nested schema, and the tree is read when the picker opens, not in every snapshot
 * (DECISIONS.md, "The tree travels on demand"). `parentId` is the nearest row that is
 * also kept, so a dropped bookkeeping entry promotes its children instead of hiding
 * them; the page rebuilds main's nested shape from these rows.
 */
export const TreeRow = Schema.Struct({
	entryId: Schema.String,
	parentId: Schema.NullOr(Schema.String),
	kind: TreeRowKind,
	/** Whole text for a user message, which goes back in the box; a preview otherwise. */
	text: Schema.String,
	/** pi hides an assistant entry with no text unless it is where the chat stands. */
	hasText: Schema.Boolean,
	/** pi's own label on the entry, from the session file. */
	label: Schema.optional(Schema.String),
	/** The entry is on the branch the transcript shows. */
	active: Schema.Boolean,
	/** The last point of the active branch: where the chat stands. */
	current: Schema.Boolean,
});
export type TreeRow = typeof TreeRow.Type;

/** pi's five tree filters, in the order its own selector cycles through them. */
export const TreeFilterMode = Schema.Literals([
	"default",
	"no-tools",
	"user-only",
	"labeled-only",
	"all",
]);
export type TreeFilterMode = typeof TreeFilterMode.Type;

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
	rows: Schema.Array(TreeRow),
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
	/** pi is waiting out a failed request and will try it again. */
	retrying: Schema.optional(Schema.Boolean),
});

/** The shell command this chat is running, and what it has written so far. */
export const BashFrame = Schema.Struct({
	t: Schema.Literals(["bash"]),
	command: Schema.String,
	output: Schema.String,
	running: Schema.Boolean,
});

/** What pi holds for the next turn, in the order pi will send it. */
export const QueueFrame = Schema.Struct({
	t: Schema.Literals(["queue"]),
	steering: Schema.Array(Schema.String),
	followUp: Schema.Array(Schema.String),
});

/**
 * Every extension status the engine holds, keyed by what set it. An extension updates its
 * own line with `setStatus`, so the whole short list travels and the page replaces it.
 */
export const StatusesFrame = Schema.Struct({
	t: Schema.Literals(["statuses"]),
	statuses: Schema.Array(UiStatus),
});

/**
 * Every extension widget the engine holds, keyed like the status rail. `setWidget` with no
 * content removes one, so the whole short list travels and the page replaces it.
 */
export const WidgetsFrame = Schema.Struct({
	t: Schema.Literals(["widgets"]),
	widgets: Schema.Array(UiWidget),
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
	autoCompaction: Schema.optional(Schema.Boolean),
	autoRetry: Schema.optional(Schema.Boolean),
	hideThinking: Schema.optional(Schema.Boolean),
	/** The label an extension set in place of the thinking pi hides, when it set one. */
	hiddenThinkingLabel: Schema.optional(Schema.String),
	/** Whether pi's coding tools (shell, edit, write) are declared right now. */
	codingTools: Schema.optional(Schema.Boolean),
	/** The thinking levels pi offers for the current model, as the model picker shows them. */
	thinkingLevels: Schema.optional(Schema.Array(ThinkingLevel)),
	/** pi's default tree filter, from `settings.json`. */
	treeFilterMode: Schema.optional(TreeFilterMode),
	/** What `/` offers: the built-in table, pi's commands, templates and skills. */
	commands: Schema.optional(Schema.Array(CommandOffer)),
});

/**
 * What the composer reads under the box: how full the window is, what the session has
 * cost, and what pi's cache warmer is doing. They travel together because pi answers
 * them together and they change on the same events; a reading pi cannot give is absent,
 * and the tab draws neither the meter nor the warmer.
 */
export const ReadingsFrame = Schema.Struct({
	t: Schema.Literals(["readings"]),
	contextUsage: Schema.optional(ContextUsage),
	stats: SessionStats,
	cacheWarming: Schema.optional(CacheWarming),
});

/**
 * Text pi put back in the composer, such as the user message a tree move restored. The
 * nonce tells the page this is a new insertion, not the draft it reported itself.
 */
export const EditorTextFrame = Schema.Struct({
	t: Schema.Literals(["editorText"]),
	/** The chat the text belongs to: a fork's text is for the new file, not the old one. */
	sessionId: Schema.String,
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
	QueueFrame,
	BashFrame,
	DriftFrame,
	StatusesFrame,
	WidgetsFrame,
	SessionMetaFrame,
	ReadingsFrame,
	EditorTextFrame,
	TreeFrame,
]);
export type ServerFrame = typeof ServerFrame.Type;

/** Decodes one frame from the socket, and fails the same way on every side. */
export const decodeServerFrame = Schema.decodeUnknownSync(ServerFrame);
