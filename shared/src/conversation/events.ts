/**
 * pi's event half of the reducer: streaming text, tool runs and the notices a
 * turn produces. Separated from `reduce.ts` so each file stays readable; both are
 * pure (no clock, no randomness, no I/O), which is what makes replay possible.
 */
import type { JsonAgentSessionEvent } from "../pi";

import { contentParts, imagesOf, textOf } from "./content";
import { costLabel, tokenLabel } from "./format";
import type {
	ConversationMessage,
	ConversationState,
	Notice,
	StreamingBlock,
	StreamingTurn,
	ToolRun,
} from "./state";

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

/**
 * A snapshot can hold a shorter transcript than the notices were anchored in: a
 * compaction replaces history with a summary. A notice whose anchor no longer
 * exists belongs where the history was rebuilt, or it would vanish and then
 * resurface mid-conversation once new messages grew past the old count.
 */
export const reanchorNotices = (notices: Notice[], messages: ConversationMessage[]): Notice[] => {
	if (notices.every((notice) => notice.afterMessages <= messages.length)) return notices;
	// The summary a compaction left at the top is where its notices happened.
	const summary = messages.findLastIndex((message) => message.role === "compactionSummary");
	const rebuilt = summary < 0 ? messages.length : summary + 1;
	return notices.map((notice) =>
		notice.afterMessages > messages.length ? { ...notice, afterMessages: rebuilt } : notice,
	);
};

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

/**
 * One streaming block, placed by pi's `contentIndex`. pi streams a whole reply as
 * `*_start`, `*_delta` and `*_end` per block, so the index is the only thing that
 * keeps text, thinking and a second text block in the order the model wrote them.
 */
const setBlock = (
	streaming: StreamingTurn,
	index: number,
	block: StreamingBlock | undefined,
): StreamingTurn => {
	const blocks = [...streaming.blocks];
	blocks[index] = block;
	return { blocks };
};

/** Append to the block at `index`, creating it when this is its first delta. */
const appendBlock = (
	streaming: StreamingTurn,
	index: number,
	kind: StreamingBlock["type"],
	delta: string,
): StreamingTurn => {
	const current = streaming.blocks[index];
	if (current === undefined || current.type !== kind) {
		const block: StreamingBlock =
			kind === "text" ? { type: "text", text: delta } : { type: "thinking", thinking: delta };
		return setBlock(streaming, index, block);
	}
	const block: StreamingBlock =
		current.type === "text"
			? { type: "text", text: current.text + delta }
			: { type: "thinking", thinking: current.thinking + delta };
	return setBlock(streaming, index, block);
};

/**
 * pi settles a run even when a tool never reported an end, such as a stop between
 * the call and its result. A row left at `running` would claim work is still
 * happening, so the settle closes it and says why.
 */
const SETTLED_TOOL_NOTE = "Not executed: the run ended before this tool finished.";

const settleTools = (tools: ToolRun[]): ToolRun[] =>
	tools.map((tool) =>
		tool.status === "running" ? { ...tool, status: "error", note: SETTLED_TOOL_NOTE } : tool,
	);

/** A delay as pi shows it in a retry status: whole seconds, never a raw millisecond count. */
const seconds = (ms: number): string => `${Math.max(1, Math.round(ms / 1_000))}s`;

/**
 * What triggered a compaction, in pi's own words (`CompactionStatusIndicator`):
 * `overflow` is the one case where the reason itself is the news.
 */
const compactionStart = (reason: "manual" | "threshold" | "overflow"): string => {
	if (reason === "manual") return "Compacting context";
	if (reason === "overflow") return "Context overflow detected, auto-compacting";
	return "Auto-compacting";
};

/**
 * A compaction reports one of three outcomes, and each of them reads differently:
 * it worked, the user stopped it, or pi refused. The billed usage is what the
 * summary call cost; pi leaves it out when the provider gave none.
 */
const compactionEnd = (
	state: ConversationState,
	event: Extract<JsonAgentSessionEvent, { type: "compaction_end" }>,
): ConversationState => {
	const settled = { ...state, isCompacting: false };
	if (event.aborted) {
		return withNotice(
			settled,
			"compaction",
			event.reason === "manual" ? "Compaction cancelled" : "Auto-compaction cancelled",
		);
	}
	const result = event.result;
	if (result === undefined) {
		const reason = event.errorMessage ?? "pi gave no reason";
		return withNotice(settled, "error", `Compaction failed: ${reason}`);
	}
	const usage = result.usage;
	const billed = usage === undefined ? "" : ` (${billedTokens(usage)})`;
	return withNotice(
		settled,
		"compaction",
		`Compacted from ${tokenLabel(result.tokensBefore)} tokens${billed}`,
	);
};

/** What the summary itself cost: every billed token and the money, as pi says it. */
const billedTokens = (usage: {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: { total: number };
}): string => {
	const tokens = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
	return `${tokenLabel(tokens)} tokens billed, ${costLabel(usage.cost.total)}`;
};

export const reduceEvent = (
	state: ConversationState,
	event: JsonAgentSessionEvent,
): ConversationState => {
	switch (event.type) {
		case "agent_start":
			return { ...state, busy: true };
		case "agent_end":
			// pi still has cleanup after this event; `agent_settled` is what ends the run.
			return state;
		case "agent_settled":
			return {
				...state,
				busy: false,
				streaming: null,
				tools: settleTools(state.tools),
			};
		case "thinking_level_changed":
			return { ...state, thinkingLevel: event.level };
		case "queue_update":
			// pi says which prompts it still holds after every queue change, so the
			// composer shows what a run accepted instead of guessing.
			return {
				...state,
				queue: { steering: [...event.steering], followUp: [...event.followUp] },
			};
		case "bash_execution_update": {
			// A delta belongs to the run pi names, so a late chunk after the command
			// finished cannot land in the next one's output.
			const current = state.bash;
			const output =
				current !== null && current.id === event.id ? current.output + event.delta : event.delta;
			return { ...state, bash: { id: event.id, output } };
		}
		case "message_start":
			if (event.message.role !== "assistant") return state;
			return { ...state, streaming: { blocks: [] } };
		case "message_update": {
			const delta = event.assistantMessageEvent;
			if (state.streaming === null) return state;
			switch (delta.type) {
				case "text_start":
					return {
						...state,
						streaming: setBlock(state.streaming, delta.contentIndex, { type: "text", text: "" }),
					};
				case "text_delta":
					return {
						...state,
						streaming: appendBlock(state.streaming, delta.contentIndex, "text", delta.delta),
					};
				case "text_end":
					// The end carries the authoritative text for that block.
					return {
						...state,
						streaming: setBlock(state.streaming, delta.contentIndex, {
							type: "text",
							text: delta.content,
						}),
					};
				case "thinking_start":
					return {
						...state,
						streaming: setBlock(state.streaming, delta.contentIndex, {
							type: "thinking",
							thinking: "",
						}),
					};
				case "thinking_delta":
					return {
						...state,
						streaming: appendBlock(state.streaming, delta.contentIndex, "thinking", delta.delta),
					};
				case "thinking_end":
					return {
						...state,
						streaming: setBlock(state.streaming, delta.contentIndex, {
							type: "thinking",
							thinking: delta.content,
						}),
					};
				default:
					// A tool call's index stays empty: its row is the tool card.
					return state;
			}
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
			return withNotice(
				{ ...state, isCompacting: true },
				"compaction",
				compactionStart(event.reason),
			);
		case "compaction_end":
			return compactionEnd(state, event);
		case "auto_retry_start":
			return withNotice(
				{ ...state, isRetrying: true },
				"retry",
				`Retrying the request (attempt ${event.attempt} of ${event.maxAttempts} in ${seconds(event.delayMs)}): ${event.errorMessage}`,
			);
		case "auto_retry_end": {
			const settled = { ...state, isRetrying: false };
			if (event.success) return withNotice(settled, "retry", `Retry ${event.attempt} succeeded`);
			return withNotice(
				settled,
				"retry",
				`Retry failed after ${event.attempt} attempt${event.attempt === 1 ? "" : "s"}: ${event.finalError ?? "pi gave no reason"}`,
			);
		}
		case "summarization_retry_scheduled":
			return withNotice(
				state,
				"retry",
				`Retrying the summary (attempt ${event.attempt} of ${event.maxAttempts} in ${seconds(event.delayMs)}): ${event.errorMessage}`,
			);
		case "summarization_retry_attempt_start":
			// The scheduled notice already names the retry; this event is its start, so
			// the only new fact is that a compaction source is compacting again.
			return event.source === "compaction" ? { ...state, isCompacting: true } : state;
		case "summarization_retry_finished":
			return { ...state, isCompacting: false };
		default:
			return state;
	}
};
