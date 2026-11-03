import type {
	SessionEntry,
	SessionManager,
	SessionTreeNode,
} from "@earendil-works/pi-coding-agent";

import type {
	AssistantBlock,
	ImageBlock,
	TranscriptEntry,
	TreeEntry,
} from "#protocol/conversation/frames";

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

const firstLine = (text: string): string => text.split("\n", 1)[0] ?? "";

const kindOf = (entry: SessionEntry): TreeEntry["kind"] => {
	if (entry.type === "message") {
		const role = entry.message.role;
		if (role === "user" || role === "assistant" || role === "toolResult") return role;
		return "other";
	}
	if (entry.type === "compaction") return "compaction";
	if (entry.type === "branch_summary") return "branchSummary";
	if (entry.type === "session_info") return "sessionInfo";
	return "other";
};

const labelOf = (entry: SessionEntry): string => {
	switch (entry.type) {
		case "message": {
			const message = entry.message;
			if (message.role === "user") {
				return firstLine(textOf(message.content)).slice(0, 200) || "User";
			}
			if (message.role === "assistant") {
				const text = message.content
					.filter((block) => block.type === "text")
					.map((block) => block.text)
					.join(" ");
				return firstLine(text).slice(0, 200) || "Assistant";
			}
			if (message.role === "toolResult") return message.toolName;
			return message.role;
		}
		case "compaction":
			return "Compaction";
		case "branch_summary":
			return "Branch summary";
		case "session_info":
			return entry.name ?? "Session";
		case "custom":
			return entry.customType;
		default:
			return entry.type;
	}
};

/** One flat tree row. `onPath` is whether the entry is on the branch the page shows. */
export const treeRowOf = (entry: SessionEntry, onPath: boolean): TreeEntry => ({
	id: entry.id,
	parentId: entry.parentId,
	kind: kindOf(entry),
	label: labelOf(entry),
	ts: tsOf(entry.timestamp),
	onPath,
});

/** pi's tree, flattened in one pass: 50,000 rows must not recurse. */
export const flatTree = (
	nodes: ReadonlyArray<SessionTreeNode>,
	onPath: ReadonlySet<string>,
): TreeEntry[] => {
	const rows: TreeEntry[] = [];
	const stack = [...nodes];
	while (stack.length > 0) {
		const node = stack.pop();
		if (node === undefined) break;
		rows.push(treeRowOf(node.entry, onPath.has(node.entry.id)));
		for (const child of node.children) stack.push(child);
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
