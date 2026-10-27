/**
 * `reduce(state, frame)`: the one place that turns socket frames into what the
 * browser shows. Pure: no clock, no randomness, no I/O, so a recorded fixture
 * replays to an identical state.
 *
 * pi's wire contract decides the shape: `message_start` gives the initial
 * message, deltas build on it, and `message_end` is authoritative. The streaming
 * buffers here are display-only and are dropped at `message_end`.
 */
import type { JsonAgentSessionEvent, ServerFrame } from "shared";
import { z } from "zod";

import { emptyConversation, isVisibleMessage } from "./state";
import type { ConversationMessage, ConversationState, Notice, ToolRun } from "./state";

const contentPartSchema = z.looseObject({
	type: z.string(),
	text: z.string().optional(),
	data: z.string().optional(),
	mimeType: z.string().optional(),
});

/** Tool results are pi's shapes, so read the two fields the transcript needs. */
const toolPayloadSchema = z.looseObject({ content: z.array(contentPartSchema).optional() });

const textOf = (payload: z.infer<typeof toolPayloadSchema>): string =>
	(payload.content ?? [])
		.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("");

const imagesOf = (payload: z.infer<typeof toolPayloadSchema>) =>
	(payload.content ?? [])
		.filter((part) => part.type === "image" && part.data !== undefined)
		.map((part) => ({
			type: "image" as const,
			data: part.data ?? "",
			mimeType: part.mimeType ?? "application/octet-stream",
		}));

const withNotice = (
	state: ConversationState,
	kind: Notice["kind"],
	text: string,
): ConversationState => ({
	...state,
	notices: [
		...state.notices,
		{ id: state.nextNoticeId, kind, text, afterMessages: state.messages.length },
	],
	nextNoticeId: state.nextNoticeId + 1,
});

const upsertTool = (
	state: ConversationState,
	toolCallId: string,
	update: Partial<ToolRun>,
): ToolRun[] => {
	const index = state.tools.findIndex((tool) => tool.toolCallId === toolCallId);
	if (index === -1) {
		const created: ToolRun = {
			toolCallId,
			toolName: update.toolName ?? "tool",
			args: update.args,
			output: "",
			images: [],
			status: "running",
			...update,
		};
		return [...state.tools, created];
	}
	const tools = [...state.tools];
	const current = tools[index];
	if (current !== undefined) tools[index] = { ...current, ...update };
	return tools;
};

/**
 * A finished tool is described twice: by `tool_execution_end` and by the
 * `toolResult` message. A snapshot only has the message, so both paths land here.
 */
const toolsWithResult = (
	tools: ToolRun[],
	message: Extract<ConversationMessage, { role: "toolResult" }>,
): ToolRun[] => {
	const payload = toolPayloadSchema.safeParse({ content: message.content });
	if (!payload.success) return tools;
	return upsertTool({ ...emptyConversation, tools }, message.toolCallId, {
		toolName: message.toolName,
		output: textOf(payload.data),
		images: imagesOf(payload.data),
		status: message.isError ? "error" : "ok",
	});
};

const toolsFromMessages = (messages: ConversationMessage[]): ToolRun[] =>
	messages.reduce<ToolRun[]>(
		(tools, message) => (message.role === "toolResult" ? toolsWithResult(tools, message) : tools),
		[],
	);

const reduceEvent = (state: ConversationState, event: JsonAgentSessionEvent): ConversationState => {
	switch (event.type) {
		case "agent_start":
			return { ...state, running: true };
		case "agent_end":
		case "agent_settled":
			return { ...state, running: false, streaming: null };
		case "message_start":
			if (event.message.role !== "assistant") return state;
			return { ...state, streaming: { text: "", thinking: "" } };
		case "message_update": {
			const delta = event.assistantMessageEvent;
			if (state.streaming === null) return state;
			if (delta.type === "text_delta") {
				return {
					...state,
					streaming: { ...state.streaming, text: state.streaming.text + delta.delta },
				};
			}
			if (delta.type === "thinking_delta") {
				return {
					...state,
					streaming: { ...state.streaming, thinking: state.streaming.thinking + delta.delta },
				};
			}
			return state;
		}
		case "message_end": {
			if (event.message.role === "system") return state;
			const messages: ConversationMessage[] = [...state.messages, event.message];
			return {
				...state,
				messages,
				streaming: event.message.role === "assistant" ? null : state.streaming,
			};
		}
		case "tool_execution_start":
			return {
				...state,
				tools: upsertTool(state, event.toolCallId, { toolName: event.toolName, args: event.args }),
			};
		case "tool_execution_update": {
			const payload = toolPayloadSchema.safeParse(event.partialResult);
			if (!payload.success) return state;
			return {
				...state,
				tools: upsertTool(state, event.toolCallId, {
					toolName: event.toolName,
					output: textOf(payload.data),
				}),
			};
		}
		case "tool_execution_end": {
			const payload = toolPayloadSchema.safeParse(event.result);
			if (!payload.success) {
				return { ...state, tools: upsertTool(state, event.toolCallId, { status: "error" }) };
			}
			return {
				...state,
				tools: upsertTool(state, event.toolCallId, {
					toolName: event.toolName,
					output: textOf(payload.data),
					images: imagesOf(payload.data),
					status: event.isError ? "error" : "ok",
					durationMs: event.durationMs,
				}),
			};
		}
		case "compaction_start":
			return withNotice(state, "compaction", "Compacting the conversation");
		case "compaction_end":
			return withNotice(state, "compaction", "Compaction finished");
		case "auto_retry_start":
			return withNotice(state, "retry", `Retrying the request (attempt ${event.attempt})`);
		case "auto_retry_end":
			return withNotice(state, "retry", event.success ? "Retry succeeded" : "Retry failed");
		default:
			return state;
	}
};

export const reduce = (state: ConversationState, frame: ServerFrame): ConversationState => {
	switch (frame.t) {
		case "snapshot":
			// A snapshot replaces the transcript: that is what makes reconnect and a
			// second tab safe. Dialogs stay, because they come from their own frames.
			const messages = frame.snapshot.messages.filter(isVisibleMessage);
			return { ...state, messages, tools: toolsFromMessages(messages), streaming: null };
		case "event":
			return reduceEvent(state, frame.event);
		case "meta":
			return { ...state, running: frame.running };
		case "dialog": {
			const dialogs = state.dialogs.filter((dialog) => dialog.id !== frame.request.id);
			return { ...state, dialogs: [...dialogs, frame.request], needsInput: true };
		}
		case "dialog-closed": {
			const dialogs = state.dialogs.filter((dialog) => dialog.id !== frame.id);
			return { ...state, dialogs, needsInput: dialogs.length > 0 };
		}
		case "error":
			return withNotice(state, "notice", `${frame.code}: ${frame.message}`);
		default:
			return state;
	}
};

export { emptyConversation };
