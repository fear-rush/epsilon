/**
 * Derived views over the conversation state. Pure functions only, so the
 * transcript can be rebuilt from a fixture in a test without React.
 *
 * A socket frame replaces the state object, not the messages an earlier frame
 * delivered, so the rows below are memoized per message. A streaming reply then
 * keeps every finished row's identity, and the view re-renders one row instead
 * of the whole transcript. The caches never change an answer: they only let an
 * unchanged input return the object it returned before.
 */
import { z } from "zod";

import { contentParts, imagesOf, textOf } from "./content";
import type { ConversationMessage, ConversationState, Notice, ToolRun } from "./state";

export type TranscriptRow =
	| { kind: "user"; key: string; text: string; images: { data: string; mimeType: string }[] }
	| { kind: "assistant"; key: string; text: string; thinking: string; streaming: boolean }
	| { kind: "tool"; key: string; run: ToolRun }
	| { kind: "summary"; key: string; label: string; text: string }
	| { kind: "notice"; key: string; notice: Notice };

type UserMessage = Extract<ConversationMessage, { role: "user" }>;
type AssistantMessage = Extract<ConversationMessage, { role: "assistant" }>;
type ToolCall = Extract<AssistantMessage["content"][number], { type: "toolCall" }>;

/** Rows keyed by the object they came from: a message, a run, or a notice. */
const userRows = new WeakMap<UserMessage, TranscriptRow>();
const otherRows = new WeakMap<OtherMessage, TranscriptRow>();
const noticeRows = new WeakMap<Notice, TranscriptRow>();
const assistantTextRows = new WeakMap<AssistantMessage, TranscriptRow | undefined>();
const assistantErrorRows = new WeakMap<AssistantMessage, TranscriptRow | undefined>();
const toolRowsByRun = new WeakMap<ToolRun, TranscriptRow>();
/** A tool call with no run yet gets one placeholder row that outlives each frame. */
const toolRowsByCall = new WeakMap<ToolCall, TranscriptRow>();

const userRow = (message: UserMessage, key: string): TranscriptRow => {
	const cached = userRows.get(message);
	if (cached !== undefined) return cached;
	const whole = z.string().safeParse(message.content);
	let row: TranscriptRow;
	if (whole.success) {
		row = { kind: "user", key, text: whole.data, images: [] };
	} else {
		const parts = contentParts(message.content);
		row = { kind: "user", key, text: textOf(parts), images: imagesOf(parts) };
	}
	userRows.set(message, row);
	return row;
};

/** The assistant's prose, or nothing when the message carried only tool calls. */
const assistantTextRow = (message: AssistantMessage, index: number): TranscriptRow | undefined => {
	if (assistantTextRows.has(message)) return assistantTextRows.get(message);
	const text = message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("");
	const thinking = message.content
		.filter((part) => part.type === "thinking")
		.map((part) => part.thinking)
		.join("");
	const row: TranscriptRow | undefined =
		text.trim() !== "" || thinking.trim() !== ""
			? { kind: "assistant", key: `a${index}`, text, thinking, streaming: false }
			: undefined;
	assistantTextRows.set(message, row);
	return row;
};

/**
 * pi records a failed provider call as an assistant message with no content and
 * `stopReason: "error"`. Nothing else carries that message, so without this row
 * a refused turn ends in silence (docs/ARCHITECTURE.md, Failure modes). Deriving
 * it from the message also makes it survive a reload and a reattach.
 */
const assistantErrorRow = (message: AssistantMessage, index: number): TranscriptRow | undefined => {
	if (assistantErrorRows.has(message)) return assistantErrorRows.get(message);
	const row: TranscriptRow | undefined =
		message.stopReason === "error"
			? {
					kind: "notice",
					key: `a${index}-error`,
					notice: {
						id: index,
						kind: "error",
						text: `${message.provider}/${message.model}: ${message.errorMessage ?? "the request failed"}`,
						afterMessages: 0,
					},
				}
			: undefined;
	assistantErrorRows.set(message, row);
	return row;
};

const toolRow = (call: ToolCall, key: string, tools: ToolRun[]): TranscriptRow => {
	const run = tools.find((tool) => tool.toolCallId === call.id);
	if (run === undefined) {
		const cached = toolRowsByCall.get(call);
		if (cached !== undefined) return cached;
		const row: TranscriptRow = {
			kind: "tool",
			key,
			run: {
				toolCallId: call.id,
				toolName: call.name,
				args: call.arguments,
				output: "",
				images: [],
				status: "pending",
			},
		};
		toolRowsByCall.set(call, row);
		return row;
	}
	const cached = toolRowsByRun.get(run);
	if (cached !== undefined) return cached;
	const row: TranscriptRow = { kind: "tool", key, run };
	toolRowsByRun.set(run, row);
	return row;
};

const assistantRows = (
	message: AssistantMessage,
	index: number,
	tools: ToolRun[],
): TranscriptRow[] => {
	const rows: TranscriptRow[] = [];
	const text = assistantTextRow(message, index);
	if (text !== undefined) rows.push(text);
	const error = assistantErrorRow(message, index);
	if (error !== undefined) rows.push(error);
	message.content
		.filter((part) => part.type === "toolCall")
		.forEach((call, callIndex) => rows.push(toolRow(call, `a${index}-t${callIndex}`, tools)));
	return rows;
};

type OtherMessage = Exclude<
	ConversationMessage,
	UserMessage | AssistantMessage | { role: "toolResult" }
>;

/**
 * Every remaining role still renders. A `!cmd` run becomes a bash card, a summary
 * becomes a muted block, and anything else names itself instead of vanishing.
 */
const otherRow = (message: OtherMessage, key: string): TranscriptRow => {
	const cached = otherRows.get(message);
	if (cached !== undefined) return cached;
	const row = otherRowOf(message, key);
	otherRows.set(message, row);
	return row;
};

const otherRowOf = (message: OtherMessage, key: string): TranscriptRow => {
	switch (message.role) {
		case "bashExecution":
			return {
				kind: "tool",
				key,
				run: {
					toolCallId: key,
					toolName: "bash",
					args: { command: message.command },
					output: message.output,
					images: [],
					status: message.exitCode === undefined || message.exitCode === 0 ? "ok" : "error",
				},
			};
		case "branchSummary":
			return { kind: "summary", key, label: "branch summary", text: message.summary };
		case "compactionSummary":
			return { kind: "summary", key, label: "compaction summary", text: message.summary };
		case "custom": {
			const content = z.string().safeParse(message.content);
			return {
				kind: "summary",
				key,
				label: message.customType,
				text: content.success ? content.data : textOf(contentParts(message.content)),
			};
		}
	}
};

const noticeRow = (notice: Notice): TranscriptRow => {
	const cached = noticeRows.get(notice);
	if (cached !== undefined) return cached;
	const row: TranscriptRow = { kind: "notice", key: `n${notice.id}`, notice };
	noticeRows.set(notice, row);
	return row;
};

/**
 * The transcript, in arrival order, with notices placed where they happened.
 * Index-derived keys stay correct because messages are only appended, and a
 * snapshot replaces the whole list with new objects (and so a cold cache).
 */
export const transcript = (state: ConversationState): TranscriptRow[] => {
	const rows: TranscriptRow[] = [];
	const notesByPosition = new Map<number, Notice[]>();
	for (const notice of state.notices) {
		notesByPosition.set(notice.afterMessages, [
			...(notesByPosition.get(notice.afterMessages) ?? []),
			notice,
		]);
	}

	const flushNotices = (position: number) => {
		for (const notice of notesByPosition.get(position) ?? []) rows.push(noticeRow(notice));
	};

	flushNotices(0);
	state.messages.forEach((message, index) => {
		if (message.role === "user") rows.push(userRow(message, `u${index}`));
		if (message.role === "assistant") rows.push(...assistantRows(message, index, state.tools));
		if (message.role === "bashExecution" || message.role === "branchSummary") {
			rows.push(otherRow(message, `m${index}`));
		}
		if (message.role === "compactionSummary" || message.role === "custom") {
			rows.push(otherRow(message, `m${index}`));
		}
		flushNotices(index + 1);
	});

	if (
		state.streaming !== null &&
		(state.streaming.text !== "" || state.streaming.thinking !== "")
	) {
		rows.push({
			kind: "assistant",
			key: "streaming",
			text: state.streaming.text,
			thinking: state.streaming.thinking,
			streaming: true,
		});
	}
	return rows;
};

/** Whether the last row is still being written to, for scroll behaviour. */
export const isStreaming = (state: ConversationState): boolean => state.streaming !== null;
