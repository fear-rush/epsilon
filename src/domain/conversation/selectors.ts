import type {
	AssistantBlock,
	AssistantEntry,
	TranscriptEntry,
} from "#protocol/conversation/frames";

import { assistantText, assistantThinking } from "./content.ts";
import type { ConversationState, StreamingTurn, ToolRun } from "./state.ts";

/**
 * Read-only views over `ConversationState`. They are pure and derive nothing the reducer
 * does not already hold, so a component that needs a different grouping asks for a new
 * selector instead of re-walking the arrays in render.
 */

export type TranscriptRow =
	| { readonly kind: "entry"; readonly id: string; readonly entry: TranscriptEntry }
	| {
			readonly kind: "run";
			readonly id: string;
			readonly steps: ReadonlyArray<RunStep>;
			readonly counts: ReadonlyArray<ToolCount>;
			readonly failed: number;
			readonly running: boolean;
	  }
	| { readonly kind: "streaming"; readonly id: string; readonly turn: StreamingTurn };

/** One call in a run: the call, the thinking that led to it, and what ran. */
export type RunStep = {
	readonly entryId: string;
	readonly call: Extract<AssistantBlock, { type: "toolCall" }>;
	readonly thinking: string;
	readonly run: ToolRun | undefined;
};

/** A run of work, as one transcript row. */
export type RunRow = Extract<TranscriptRow, { kind: "run" }>;

/** A run's header counts the kinds of tool it used, never their arguments. */
export type ToolCount = { readonly category: string; readonly count: number };

/**
 * pi names its tools; a run's header counts their kinds. A name with no kind is counted
 * under its own name, so an unknown tool still appears instead of being folded into
 * "other".
 */
const CATEGORY_OF = new Map<string, string>([
	["bash", "command"],
	["read", "read"],
	["edit", "edit"],
	["write", "edit"],
	["grep", "search"],
	["find", "search"],
	["ls", "search"],
]);

/** The order a run's counts read in: what it ran, what it changed, what it looked at. */
const CATEGORY_ORDER = ["command", "edit", "read", "search"];

const categoryOf = (toolName: string): string => CATEGORY_OF.get(toolName) ?? toolName;

const rank = (category: string): number => {
	const index = CATEGORY_ORDER.indexOf(category);
	return index === -1 ? CATEGORY_ORDER.length : index;
};

const countOf = (steps: ReadonlyArray<RunStep>): ReadonlyArray<ToolCount> => {
	const counts = new Map<string, number>();
	for (const step of steps) {
		const category = categoryOf(step.call.toolName);
		counts.set(category, (counts.get(category) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([category, count]) => ({ category, count }))
		.toSorted((left, right) => rank(left.category) - rank(right.category));
};

/**
 * A message that only called tools belongs to the run it is part of. A message that also
 * wrote text ends the run: the prose is a boundary the reader expects, as it is in pi's own
 * transcript, so a run never swallows an answer.
 */
const isRunEntry = (entry: TranscriptEntry): entry is AssistantEntry =>
	entry.role === "assistant" &&
	assistantText(entry) === "" &&
	entry.blocks.some((block) => block.type === "toolCall");

/** A tool result as pi wrote it, for a page the engine sent without live runs. */
type ToolResultEntry = Extract<TranscriptEntry, { role: "toolResult" }>;

/**
 * A page loaded from history carries entries, not live runs: the engine replays runs only
 * for the window it opens on. Without this the steps of an old run would all read
 * "running", and opening one would show no output at all.
 */
const runFromResult = (
	entryId: string,
	call: Extract<AssistantBlock, { type: "toolCall" }>,
	result: ToolResultEntry,
): ToolRun => ({
	toolCallId: call.toolCallId,
	toolName: call.toolName,
	entryId,
	args: call.args,
	output: result.output,
	images: result.images,
	status: result.isError ? "error" : "ok",
	durationMs: undefined,
	children: (result.nested?.calls ?? []).map((child) => ({
		toolCallId: child.id,
		toolName: child.name,
		entryId: result.id,
		args: child.args,
		output: child.error ?? "",
		images: [],
		status: child.status === "error" ? "error" : child.status === "unfinished" ? "running" : "ok",
		durationMs: child.durationMs,
		children: [],
	})),
});

/** The steps one message adds, with its thinking on the call it led to. */
const stepsOf = (
	entry: AssistantEntry,
	runs: ReadonlyMap<string, ToolRun>,
	results: ReadonlyMap<string, ToolResultEntry>,
): ReadonlyArray<RunStep> => {
	const thinking = assistantThinking(entry).trim();
	const steps: RunStep[] = [];
	for (const block of entry.blocks) {
		if (block.type !== "toolCall") continue;
		const result = results.get(block.toolCallId);
		steps.push({
			entryId: entry.id,
			call: block,
			thinking: steps.length === 0 ? thinking : "",
			run:
				runs.get(block.toolCallId) ??
				(result === undefined ? undefined : runFromResult(entry.id, block, result)),
		});
	}
	return steps;
};

const runRow = (id: string, steps: ReadonlyArray<RunStep>): TranscriptRow => ({
	kind: "run",
	id,
	steps,
	counts: countOf(steps),
	failed: steps.filter((step) => step.run?.status === "error").length,
	running: steps.some((step) => step.run?.status === "running"),
});

/**
 * The transcript in display order: entries as they arrived, then the message that is still
 * streaming. A streaming row keeps its own id until `append` replaces it.
 *
 * Consecutive messages that only called tools are one row, keyed by the first of them: one
 * turn of the agent loop is one message per call, so a row each would fill the window with
 * headings. Everything inside the run keeps its own call id, so opening it never moves.
 */
export function transcript(state: ConversationState): ReadonlyArray<TranscriptRow> {
	const rows: TranscriptRow[] = [];
	const runs = new Map(state.tools.map((tool) => [tool.toolCallId, tool]));
	const results = new Map<string, ToolResultEntry>();
	/** The calls this window can draw, whichever page they came from. */
	const called = new Set<string>();
	for (const entry of state.entries) {
		if (entry.role === "toolResult") results.set(entry.toolCallId, entry);
		if (entry.role !== "assistant") continue;
		for (const block of entry.blocks) {
			if (block.type === "toolCall") called.add(block.toolCallId);
		}
	}
	/** The run still taking messages; a tool result between two of them does not end it. */
	let run: { readonly id: string; readonly steps: ReadonlyArray<RunStep> } | undefined;
	const flush = (): void => {
		if (run === undefined) return;
		rows.push(runRow(run.id, run.steps));
		run = undefined;
	};
	for (const entry of state.entries) {
		// A tool result whose call is in the window is drawn inside that call's card. Keeping
		// the entry as a row would leave an empty article and the gap between rows behind it.
		if (entry.role === "toolResult" && called.has(entry.toolCallId)) continue;
		if (isRunEntry(entry)) {
			const steps = stepsOf(entry, runs, results);
			run =
				run === undefined
					? { id: entry.id, steps }
					: { id: run.id, steps: [...run.steps, ...steps] };
			continue;
		}
		flush();
		rows.push({ kind: "entry", id: entry.id, entry });
	}
	flush();
	// The last run is still being worked on between two steps, when it has no live tool of
	// its own: a busy chat keeps it open and says so, instead of closing and reopening it
	// each time a call settles.
	const tail = rows.at(-1);
	if (state.busy && tail?.kind === "run" && !tail.running) {
		rows[rows.length - 1] = { ...tail, running: true };
	}
	for (const turn of state.streaming) rows.push({ kind: "streaming", id: turn.streamId, turn });
	return rows;
}

/** The tool runs an assistant entry started, in call order. */
export function toolRunsFor(state: ConversationState, entryId: string): ReadonlyArray<ToolRun> {
	return state.tools.filter((tool) => tool.entryId === entryId);
}

/** The tool run a tool-result entry belongs to, if its call is in the window. */
export function toolRunOf(state: ConversationState, toolCallId: string): ToolRun | undefined {
	return state.tools.find((tool) => tool.toolCallId === toolCallId);
}

export function entryById(state: ConversationState, id: string): TranscriptEntry | undefined {
	return state.entries.find((entry) => entry.id === id);
}

/** A chat is writable unless something outside Epsilon changed its file. */
export function isWritable(state: ConversationState): boolean {
	return state.drift === undefined;
}

/** The assistant text a collapsed row shows, or the notice that stands in for one. */
export function lastAssistantText(state: ConversationState): string | undefined {
	const last = state.entries.findLast(
		(entry): entry is AssistantEntry => entry.role === "assistant",
	);
	return last === undefined ? undefined : assistantText(last);
}
