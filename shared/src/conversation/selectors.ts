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
import { tokenLabel } from "./format";
import type {
	ConversationMessage,
	ConversationState,
	NestedToolRun,
	Notice,
	StreamingTurn,
	ToolRun,
} from "./state";

/** One block of a reply, in pi's own order, so interleaved thinking stays where it came. */
type AssistantSegment = { kind: "text"; text: string } | { kind: "thinking"; text: string };

export type TranscriptRow =
	| { kind: "user"; key: string; text: string; images: { data: string; mimeType: string }[] }
	| {
			kind: "assistant";
			key: string;
			segments: AssistantSegment[];
			streaming: boolean;
			/** pi hides the thinking, so one label stands in for blocks it dropped. */
			hiddenThinking?: boolean;
	  }
	| { kind: "tool"; key: string; run: ToolRun; children: ToolRowNode[] }
	| { kind: "summary"; key: string; label: string; text: string }
	| { kind: "notice"; key: string; notice: Notice };

/** One tool card and the calls it made, which it draws inside itself. */
export type ToolRowNode = { run: ToolRun; children: ToolRowNode[] };

type UserMessage = Extract<ConversationMessage, { role: "user" }>;
type AssistantMessage = Extract<ConversationMessage, { role: "assistant" }>;
type ToolCall = Extract<AssistantMessage["content"][number], { type: "toolCall" }>;

/** Rows keyed by the object they came from: a message, a run, or a notice. */
const userRows = new WeakMap<UserMessage, TranscriptRow>();
const otherRows = new WeakMap<OtherMessage, TranscriptRow>();
const noticeRows = new WeakMap<Notice, TranscriptRow>();
/** One message's row depends on the thinking toggle, so both answers are cached. */
type ThinkingRows = { shown?: TranscriptRow; hidden?: TranscriptRow };

const assistantTextRows = new WeakMap<AssistantMessage, ThinkingRows>();
const assistantStopRows = new WeakMap<AssistantMessage, TranscriptRow | undefined>();
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

/**
 * The blocks of a reply in pi's order. Empty blocks are dropped, never reordered:
 * a reply that wrote text, thought, then wrote again keeps that order.
 */
const segmentsOf = (content: AssistantMessage["content"]): AssistantSegment[] =>
	content.flatMap<AssistantSegment>((part) => {
		if (part.type === "text" && part.text.trim() !== "") return [{ kind: "text", text: part.text }];
		if (part.type === "thinking" && part.thinking.trim() !== "")
			return [{ kind: "thinking", text: part.thinking }];
		return [];
	});

const assistantTextRow = (
	message: AssistantMessage,
	index: number,
	hideThinking: boolean,
): TranscriptRow | undefined => {
	const slot = hideThinking ? "hidden" : "shown";
	const cached = assistantTextRows.get(message);
	if (cached !== undefined && slot in cached) return cached[slot];
	const all = segmentsOf(message.content);
	// pi draws a label where it hid thinking instead of dropping the reply's block, so
	// a reply that only thought still has a row to stand on.
	const hiddenThinking = hideThinking && all.some((segment) => segment.kind === "thinking");
	const segments = hideThinking ? all.filter((segment) => segment.kind === "text") : all;
	const row: TranscriptRow | undefined =
		segments.length > 0 || hiddenThinking
			? { kind: "assistant", key: `a${index}`, segments, streaming: false, hiddenThinking }
			: undefined;
	const rows: ThinkingRows = cached ?? {};
	rows[slot] = row;
	assistantTextRows.set(message, rows);
	return row;
};

/**
 * pi records a failed or stopped turn on the assistant message itself: `stopReason`
 * is `error` or `aborted`, and no separate event carries it. Nothing else would
 * show it, so a refused turn would end in silence (docs/ARCHITECTURE.md, Failure
 * modes). Deriving the row from the message also makes it survive a reload.
 */
const assistantStopRow = (message: AssistantMessage, index: number): TranscriptRow | undefined => {
	if (assistantStopRows.has(message)) return assistantStopRows.get(message);
	const row = stopRowOf(message, index);
	assistantStopRows.set(message, row);
	return row;
};

const stopRowOf = (message: AssistantMessage, index: number): TranscriptRow | undefined => {
	if (message.stopReason === "error") {
		return {
			kind: "notice",
			key: `a${index}-error`,
			notice: {
				id: index,
				kind: "error",
				text: `${message.provider}/${message.model}: ${message.errorMessage ?? "the request failed"}`,
				afterMessages: 0,
			},
		};
	}
	if (message.stopReason === "aborted") {
		return {
			kind: "notice",
			key: `a${index}-aborted`,
			notice: { id: index, kind: "notice", text: "Operation aborted", afterMessages: 0 },
		};
	}
	return undefined;
};

/**
 * A call's own cards: the ones streaming in with its id as their parent, or, once
 * the run is recorded, the calls pi wrote on its result. pi records nested calls
 * flat, with `<caller>/<n>` ids, so a recorded child gets no children of its own.
 */
const nestedNodes = (run: ToolRun, tools: ToolRun[], seen: ReadonlySet<string>): ToolRowNode[] => {
	const live = tools.filter(
		(tool) => tool.parentToolCallId === run.toolCallId && !seen.has(tool.toolCallId),
	);
	if (live.length > 0) {
		return live.map((child) => {
			const next = new Set(seen).add(child.toolCallId);
			return { run: child, children: nestedNodes(child, tools, next) };
		});
	}
	return (run.nested ?? []).map((call) => ({ run: recordedRun(call), children: [] }));
};

/** A recorded nested call as the tool row draws it; pi keeps no output for these. */
const recordedRun = (call: NestedToolRun): ToolRun => ({
	toolCallId: call.toolCallId,
	toolName: call.toolName,
	args: call.args,
	output: "",
	images: [],
	status: call.status === "unfinished" ? "error" : call.status,
	durationMs: call.durationMs,
	note: call.status === "unfinished" ? "Unfinished when the calling tool ended." : call.error,
});

const toolRow = (call: ToolCall, key: string, tools: ToolRun[]): TranscriptRow => {
	const run = tools.find((tool) => tool.toolCallId === call.id);
	if (run === undefined) {
		const cached = toolRowsByCall.get(call);
		if (cached !== undefined) return cached;
		const row: TranscriptRow = {
			kind: "tool",
			key,
			children: [],
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
	const children = nestedNodes(run, tools, new Set([run.toolCallId]));
	// A card with children redraws as they arrive, so it keeps no cached row.
	if (children.length > 0) return { kind: "tool", key, run, children };
	const cached = toolRowsByRun.get(run);
	if (cached !== undefined) return cached;
	const row: TranscriptRow = { kind: "tool", key, run, children: [] };
	toolRowsByRun.set(run, row);
	return row;
};

const assistantRows = (
	message: AssistantMessage,
	index: number,
	tools: ToolRun[],
	hideThinking: boolean,
): TranscriptRow[] => {
	const rows: TranscriptRow[] = [];
	const text = assistantTextRow(message, index, hideThinking);
	if (text !== undefined) rows.push(text);
	const stop = assistantStopRow(message, index);
	if (stop !== undefined) rows.push(stop);
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

type BashExecutionMessage = Extract<ConversationMessage, { role: "bashExecution" }>;

/** A cancelled command has no exit code, and it did not succeed either. */
const bashStatus = (message: BashExecutionMessage): ToolRun["status"] =>
	message.cancelled || (message.exitCode !== undefined && message.exitCode !== 0) ? "error" : "ok";

/** What pi's own bash card says about a command beyond its output, in its words. */
const bashNote = (message: BashExecutionMessage): string | undefined => {
	const parts: string[] = [];
	if (message.cancelled) parts.push("(cancelled)");
	else if (message.exitCode !== undefined && message.exitCode !== 0) {
		parts.push(`(exit ${message.exitCode})`);
	}
	if (message.truncated) {
		parts.push(
			message.fullOutputPath === undefined
				? "Output truncated."
				: `Output truncated. Full output: ${message.fullOutputPath}`,
		);
	}
	return parts.length === 0 ? undefined : parts.join("\n");
};

const otherRowOf = (message: OtherMessage, key: string): TranscriptRow => {
	switch (message.role) {
		case "bashExecution":
			return {
				kind: "tool",
				key,
				children: [],
				run: {
					toolCallId: key,
					toolName: "bash",
					args: { command: message.command },
					output: message.output,
					images: [],
					status: bashStatus(message),
					note: bashNote(message),
				},
			};
		case "branchSummary":
			return { kind: "summary", key, label: "branch summary", text: message.summary };
		case "compactionSummary":
			// pi's own label for the block a compaction leaves: how much it replaced.
			return {
				kind: "summary",
				key,
				label: `Compacted from ${tokenLabel(message.tokensBefore)} tokens`,
				text: message.summary,
			};
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
		if (message.role === "assistant")
			rows.push(...assistantRows(message, index, state.tools, state.hideThinkingBlock));
		if (message.role === "bashExecution" || message.role === "branchSummary") {
			rows.push(otherRow(message, `m${index}`));
		}
		if (message.role === "compactionSummary" || (message.role === "custom" && message.display)) {
			rows.push(otherRow(message, `m${index}`));
		}
		flushNotices(index + 1);
	});

	const streaming = streamingRow(state.streaming, state.hideThinkingBlock);
	if (streaming !== undefined) rows.push(streaming);
	return rows;
};

/** The blocks of a reply still arriving, in pi's order and without the empties. */
const streamingRow = (
	turn: StreamingTurn | null,
	hideThinking: boolean,
): TranscriptRow | undefined => {
	if (turn === null) return undefined;
	let hiddenThinking = false;
	const segments = turn.blocks.flatMap<AssistantSegment>((block) => {
		if (block === undefined) return [];
		if (block.type === "text") return block.text === "" ? [] : [{ kind: "text", text: block.text }];
		if (block.thinking === "") return [];
		if (hideThinking) {
			hiddenThinking = true;
			return [];
		}
		return [{ kind: "thinking", text: block.thinking }];
	});
	if (segments.length === 0 && !hiddenThinking) return undefined;
	return { kind: "assistant", key: "streaming", segments, streaming: true, hiddenThinking };
};

/** Whether the last row is still being written to, for scroll behaviour. */
export const isStreaming = (state: ConversationState): boolean => state.streaming !== null;
