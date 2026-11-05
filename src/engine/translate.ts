import type {
	SessionEntry,
	SessionManager,
	SessionTreeNode,
} from "@earendil-works/pi-coding-agent";

import type {
	AssistantBlock,
	ImageBlock,
	TranscriptEntry,
	TreeRow,
} from "#protocol/conversation/frames";

import { tokenLabel } from "../domain/conversation/format.ts";
import { withDefined } from "../domain/object.ts";

/**
 * pi's session entries, transcribed into the wire's rows.
 *
 * This is the only place the two vocabularies meet. Ids, parents and timestamps are pi's
 * own, because a row must keep its identity when a window starts mid-history; nothing here
 * invents an index. Content pi can hold but the wire has no row for (bash execution,
 * custom messages, context edits) is dropped here and named by the caller, never silently
 * turned into a message it is not.
 */

/** A tool result larger than this is cut for the window; the full text is a catalog read. */
export const maxToolOutput = 64 * 1024;

const cut = (text: string): string =>
	text.length <= maxToolOutput ? text : `${text.slice(0, maxToolOutput)}\n[truncated]`;

/** The content blocks pi's messages share; the ones this file reads. */
type ContentBlock = {
	readonly type: string;
	readonly text?: string;
	readonly data?: string;
	readonly mimeType?: string;
};

type Content = string | ReadonlyArray<ContentBlock>;

const textOf = (content: Content): string => {
	if (typeof content === "string") return content;
	const parts: string[] = [];
	for (const block of content) {
		if (block.type === "text" && block.text !== undefined) parts.push(block.text);
	}
	return parts.join("\n");
};

const imagesOf = (content: Content): ImageBlock[] => {
	if (typeof content === "string") return [];
	const images: ImageBlock[] = [];
	for (const block of content) {
		if (block.type === "image" && block.data !== undefined && block.mimeType !== undefined) {
			images.push({ data: block.data, mimeType: block.mimeType, type: "image" });
		}
	}
	return images;
};

type MessageEntry = Extract<SessionEntry, { type: "message" }>;
type AgentMessage = MessageEntry["message"];
type UserMessage = Extract<AgentMessage, { role: "user" }>;
type AssistantMessage = Extract<AgentMessage, { role: "assistant" }>;
type ToolResultMessage = Extract<AgentMessage, { role: "toolResult" }>;

const tsOf = (timestamp: string): number => {
	const parsed = Date.parse(timestamp);
	return Number.isFinite(parsed) ? parsed : 0;
};

const assistantBlocks = (message: AssistantMessage): AssistantBlock[] => {
	const blocks: AssistantBlock[] = [];
	for (const block of message.content) {
		switch (block.type) {
			case "text":
				blocks.push({ type: "text", text: block.text });
				break;
			case "thinking":
				blocks.push({ type: "thinking", thinking: block.thinking });
				break;
			case "toolCall":
				blocks.push({
					type: "toolCall",
					toolCallId: block.id,
					toolName: block.name,
					args: block.arguments,
				});
				break;
			default:
				break;
		}
	}
	return blocks;
};

const userEntry = (entry: MessageEntry & { message: UserMessage }): TranscriptEntry => ({
	id: entry.id,
	parentId: entry.parentId,
	role: "user",
	text: textOf(entry.message.content),
	images: imagesOf(entry.message.content),
	ts: tsOf(entry.timestamp),
});

const assistantEntry = (entry: MessageEntry & { message: AssistantMessage }): TranscriptEntry => ({
	id: entry.id,
	parentId: entry.parentId,
	role: "assistant",
	blocks: assistantBlocks(entry.message),
	ts: tsOf(entry.timestamp),
});

const toolResultEntry = (entry: MessageEntry & { message: ToolResultMessage }): TranscriptEntry => {
	const text = textOf(entry.message.content);
	return {
		id: entry.id,
		parentId: entry.parentId,
		role: "toolResult",
		toolCallId: entry.message.toolCallId,
		toolName: entry.message.toolName,
		isError: entry.message.isError,
		output: cut(text),
		images: imagesOf(entry.message.content),
		ts: tsOf(entry.timestamp),
	};
};

/** One row for the transcript, or `undefined` when the wire has no shape for it. */
export const transcriptOf = (entry: SessionEntry): TranscriptEntry | undefined => {
	if (entry.type === "compaction") {
		return {
			id: entry.id,
			label: `Compacted from ${tokenLabel(entry.tokensBefore)} tokens`,
			parentId: entry.parentId,
			role: "summary",
			text: cut(entry.summary),
			ts: tsOf(entry.timestamp),
		};
	}
	if (entry.type === "branch_summary") {
		return {
			id: entry.id,
			label: "branch summary",
			parentId: entry.parentId,
			role: "summary",
			text: cut(entry.summary),
			ts: tsOf(entry.timestamp),
		};
	}
	if (entry.type !== "message") return undefined;
	const message = entry.message;
	switch (message.role) {
		case "user":
			return userEntry({ ...entry, message });
		case "assistant":
			return assistantEntry({ ...entry, message });
		case "toolResult":
			return toolResultEntry({ ...entry, message });
		default:
			return undefined;
	}
};

/**
 * The entry a finalized message became. pi notifies listeners before it persists the
 * entry, so the leaf at that moment is the previous message; the branch lookup compares
 * the message object itself, which pi appends without copying.
 */
export const entryForMessage = (
	sessionManager: SessionManager,
	message: MessageEntry["message"],
): SessionEntry | undefined => {
	const branch = sessionManager.getBranch();
	for (let index = branch.length - 1; index >= 0; index--) {
		const entry = branch[index];
		if (entry?.type === "message" && entry.message === message) return entry;
	}
	return undefined;
};

/** A message pi appended, with the leaf entry it became. */
export const appendedEntry = (entry: SessionEntry | undefined): TranscriptEntry | undefined =>
	entry === undefined ? undefined : transcriptOf(entry);

/** The tool calls an assistant entry holds, so a tool delta can name its card's row. */
export const toolCallsOf = (
	entry: TranscriptEntry,
): ReadonlyArray<{ id: string; name: string }> => {
	if (entry.role !== "assistant") return [];
	return entry.blocks
		.filter((block) => block.type === "toolCall")
		.map((block) => ({ id: block.toolCallId, name: block.toolName }));
};

/** How much of a reply or a summary a tree row shows; a user message keeps its whole text. */
const PREVIEW_LENGTH = 160;

/** One line of a text, so a row stays small however long the message is. */
const previewOf = (text: string): string => {
	const line = text.trim().replaceAll(/\s+/g, " ");
	return line.length > PREVIEW_LENGTH ? `${line.slice(0, PREVIEW_LENGTH)}…` : line;
};

/** The entries that make up the chat's position; a bookkeeping entry is not one. */
export const positionEntry = (entry: SessionEntry): boolean =>
	entry.type === "branch_summary" ||
	entry.type === "compaction" ||
	(entry.type === "message" &&
		(entry.message.role === "user" || entry.message.role === "assistant"));

/** A preview for an entry the default filter hides and `all` shows. */
const bookkeepingText = (entry: SessionEntry): string | undefined => {
	switch (entry.type) {
		case "label":
			return entry.label === undefined ? "Label removed" : `Label: ${entry.label}`;
		case "context_edit":
			return "Context edited";
		case "custom":
			return `Custom: ${entry.customType}`;
		case "model_change":
			return `Model: ${entry.provider}/${entry.modelId}`;
		case "thinking_level_change":
			return `Thinking: ${entry.thinkingLevel}`;
		case "session_info":
			return entry.name === undefined ? "Session name cleared" : `Renamed: ${entry.name}`;
		default:
			return undefined;
	}
};

type TreeRowBase = Omit<TreeRow, "parentId">;
type RowOf = Omit<TreeRowBase, "label" | "active" | "current">;

/**
 * One pickable row, or undefined when pi keeps the entry out of the picker (a usage
 * record, an extension's own entry). A spent assistant reply still counts as text when it
 * failed, so an error is never a row the picker hides.
 */
const rowOf = (entry: SessionEntry): RowOf | undefined => {
	if (entry.type === "message" && entry.message.role === "user") {
		return { entryId: entry.id, hasText: true, kind: "user", text: textOf(entry.message.content) };
	}
	if (entry.type === "message" && entry.message.role === "assistant") {
		const message = entry.message;
		const text = message.content.map((part) => (part.type === "text" ? part.text : "")).join("");
		const thinking = message.content
			.map((part) => (part.type === "thinking" ? part.thinking : ""))
			.join("");
		const tools = message.content.flatMap((part) => (part.type === "toolCall" ? [part.name] : []));
		// A file another version wrote may hold no stop reason at all; "not a stop" would
		// then read as a failure, and the default filter would show a row it hides.
		const stopReason: unknown = message.stopReason;
		const failed =
			message.errorMessage !== undefined ||
			(typeof stopReason === "string" && stopReason !== "stop" && stopReason !== "toolUse");
		const body = text.trim();
		const thought = thinking.trim();
		return {
			entryId: entry.id,
			hasText: body !== "" || failed,
			kind: "assistant",
			text:
				body === ""
					? thought === ""
						? tools.length > 0
							? `Tool call: ${tools.join(", ")}`
							: previewOf(message.errorMessage ?? "No text")
						: previewOf(thought)
					: previewOf(body),
		};
	}
	if (entry.type === "branch_summary" || entry.type === "compaction") {
		return { entryId: entry.id, hasText: true, kind: "summary", text: previewOf(entry.summary) };
	}
	if (entry.type === "message" && entry.message.role === "toolResult") {
		const output = textOf(entry.message.content);
		return {
			entryId: entry.id,
			hasText: true,
			kind: "tool",
			text: previewOf(
				output.trim() === "" ? entry.message.toolName : `${entry.message.toolName}: ${output}`,
			),
		};
	}
	const text = bookkeepingText(entry);
	return text === undefined
		? undefined
		: { entryId: entry.id, hasText: true, kind: "settings", text };
};

/**
 * pi's tree rows, flat and in tree order: 50,000 entries must not recurse. A row pi's
 * picker hides promotes its children to the nearest row that stays, so a hidden
 * bookkeeping entry never takes a whole branch with it.
 */
export const treeRowsOf = (
	nodes: ReadonlyArray<SessionTreeNode>,
	active: ReadonlySet<string>,
	currentId: string | undefined,
): TreeRow[] => {
	type Frame = { readonly node: SessionTreeNode; readonly parentId: string | null };
	const rows: TreeRow[] = [];
	const stack: Frame[] = [];
	for (let index = nodes.length - 1; index >= 0; index -= 1) {
		const node = nodes[index];
		if (node !== undefined) stack.push({ node, parentId: null });
	}
	while (stack.length > 0) {
		const frame = stack.pop();
		if (frame === undefined) break;
		const entry = frame.node.entry;
		const row = rowOf(entry);
		if (row !== undefined) {
			rows.push(
				withDefined(
					{
						...row,
						parentId: frame.parentId,
						active: active.has(entry.id),
						current: entry.id === currentId,
					},
					"label",
					frame.node.label,
				),
			);
		}
		const kept = row === undefined ? frame.parentId : entry.id;
		for (let index = frame.node.children.length - 1; index >= 0; index -= 1) {
			const child = frame.node.children[index];
			if (child !== undefined) stack.push({ node: child, parentId: kept });
		}
	}
	return rows;
};

/** The plain text of a tool update or result, which pi sends as content blocks. */
export const toolTextOf = (value: unknown): string => {
	if (typeof value === "string") return value;
	if (typeof value !== "object" || value === null || !("content" in value)) return "";
	// SAFETY: pi's tool result is `{ content: (TextContent | ImageContent)[] }`, and the
	// loop below reads only `type` and `text`, refusing anything that is not a string.
	return cut(textOf(value.content as Content));
};
