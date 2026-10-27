/**
 * Derived views over the conversation state. Pure functions only, so the
 * transcript can be rebuilt from a fixture in a test without React.
 */
import { z } from "zod";

import type { ConversationMessage, ConversationState, Notice, ToolRun } from "./state";

export type TranscriptRow =
	| { kind: "user"; key: string; text: string; images: { data: string; mimeType: string }[] }
	| { kind: "assistant"; key: string; text: string; thinking: string; streaming: boolean }
	| { kind: "tool"; key: string; run: ToolRun }
	| { kind: "summary"; key: string; label: string; text: string }
	| { kind: "notice"; key: string; notice: Notice };

type UserMessage = Extract<ConversationMessage, { role: "user" }>;
type AssistantMessage = Extract<ConversationMessage, { role: "assistant" }>;

const contentPartSchema = z.looseObject({
	type: z.string(),
	text: z.string().optional(),
	data: z.string().optional(),
	mimeType: z.string().optional(),
});

const userRow = (message: UserMessage, key: string): TranscriptRow => {
	const whole = z.string().safeParse(message.content);
	if (whole.success) return { kind: "user", key, text: whole.data, images: [] };

	const parts = z.array(contentPartSchema).safeParse(message.content);
	if (!parts.success) return { kind: "user", key, text: "", images: [] };

	const text = parts.data
		.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("");
	const images = parts.data
		.filter((part) => part.type === "image" && part.data !== undefined)
		.map((part) => ({
			data: part.data ?? "",
			mimeType: part.mimeType ?? "application/octet-stream",
		}));
	return { kind: "user", key, text, images };
};

const assistantRows = (
	message: AssistantMessage,
	index: number,
	tools: ToolRun[],
): TranscriptRow[] => {
	const text = message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("");
	const thinking = message.content
		.filter((part) => part.type === "thinking")
		.map((part) => part.thinking)
		.join("");
	const rows: TranscriptRow[] = [];
	if (text.trim() !== "" || thinking.trim() !== "") {
		rows.push({ kind: "assistant", key: `a${index}`, text, thinking, streaming: false });
	}
	message.content
		.filter((part) => part.type === "toolCall")
		.forEach((call, callIndex) => {
			const run: ToolRun = tools.find((tool) => tool.toolCallId === call.id) ?? {
				toolCallId: call.id,
				toolName: call.name,
				args: call.arguments,
				output: "",
				images: [],
				status: "pending",
			};
			rows.push({ kind: "tool", key: `a${index}-t${callIndex}`, run });
		});
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
				text: content.success ? content.data : "",
			};
		}
	}
};

/** The transcript, in arrival order, with notices placed where they happened. */
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
		for (const notice of notesByPosition.get(position) ?? []) {
			rows.push({ kind: "notice", key: `n${notice.id}`, notice });
		}
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
