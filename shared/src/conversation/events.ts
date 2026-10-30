/**
 * pi's event half of the reducer: streaming text, tool runs and the notices a
 * turn produces. Separated from `reduce.ts` so each file stays readable; both are
 * pure (no clock, no randomness, no I/O), which is what makes replay possible.
 */
import type { JsonAgentSessionEvent } from "../pi";

import { contentParts, imagesOf, textOf } from "./content";
import type { ConversationMessage, ConversationState, Notice, ToolRun } from "./state";

export const withNotice = (
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

const upsertTool = (tools: ToolRun[], toolCallId: string, update: Partial<ToolRun>): ToolRun[] => {
	const index = tools.findIndex((tool) => tool.toolCallId === toolCallId);
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
		return [...tools, created];
	}
	const current = tools[index];
	if (current === undefined) return tools;
	const next = [...tools];
	next[index] = { ...current, ...update };
	return next;
};

/**
 * A finished tool is described twice: by `tool_execution_end` and by the
 * `toolResult` message. A snapshot only has the message, so both paths land here.
 */
const withResult = (
	tools: ToolRun[],
	message: Extract<ConversationMessage, { role: "toolResult" }>,
): ToolRun[] => {
	const parts = contentParts(message.content);
	return upsertTool(tools, message.toolCallId, {
		toolName: message.toolName,
		output: textOf(parts),
		images: imagesOf(parts),
		status: message.isError ? "error" : "ok",
	});
};

/**
 * The arguments are on the assistant's `toolCall`, never on the result, so a run
 * built from a result alone has no command and no diff to show.
 */
const withCallArgs = (
	tools: ToolRun[],
	message: Extract<ConversationMessage, { role: "assistant" }>,
): ToolRun[] =>
	message.content.reduce<ToolRun[]>((current, part) => {
		if (part.type !== "toolCall") return current;
		const index = current.findIndex((tool) => tool.toolCallId === part.id);
		const run = index === -1 ? undefined : current[index];
		if (run === undefined) return current;
		const next = [...current];
		next[index] = { ...run, toolName: part.name, args: part.arguments };
		return next;
	}, tools);

/**
 * Two passes because a result arrives after the call that explains it: results
 * create the runs, calls then supply the arguments.
 */
export const toolsFromMessages = (messages: ConversationMessage[]): ToolRun[] => {
	const withResults = messages.reduce<ToolRun[]>(
		(tools, message) => (message.role === "toolResult" ? withResult(tools, message) : tools),
		[],
	);
	return messages.reduce<ToolRun[]>(
		(tools, message) => (message.role === "assistant" ? withCallArgs(tools, message) : tools),
		withResults,
	);
};

export const reduceEvent = (
	state: ConversationState,
	event: JsonAgentSessionEvent,
): ConversationState => {
	switch (event.type) {
		case "agent_start":
			return { ...state, busy: true };
		case "agent_end":
		case "agent_settled":
			return { ...state, busy: false, streaming: null };
		case "thinking_level_changed":
			return { ...state, thinkingLevel: event.level };
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
				tools: upsertTool(state.tools, event.toolCallId, {
					toolName: event.toolName,
					args: event.args,
				}),
			};
		case "tool_execution_update": {
			const parts = contentParts(event.partialResult);
			return {
				...state,
				tools: upsertTool(state.tools, event.toolCallId, {
					toolName: event.toolName,
					output: textOf(parts),
				}),
			};
		}
		case "tool_execution_end": {
			const parts = contentParts(event.result);
			return {
				...state,
				tools: upsertTool(state.tools, event.toolCallId, {
					toolName: event.toolName,
					output: textOf(parts),
					images: imagesOf(parts),
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
