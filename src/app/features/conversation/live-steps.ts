import type { ConversationState } from "#domain/conversation/state";
import { argsOf } from "#domain/conversation/tools";
import type { AssistantEntry } from "#protocol/conversation/frames";
import type { StepStatus } from "@/components/ai-elements/status-icon";

import { toolTitle } from "./tool-trace";

export type LiveStep = {
	readonly key: string;
	readonly title: string;
	readonly status: StepStatus;
};

const statusOf = (status: "running" | "ok" | "error"): StepStatus => {
	if (status === "running") return "running";
	if (status === "error") return "error";
	return "done";
};

/**
 * The steps the current run has taken so far, for the Task row above the composer. The
 * last entry decides whether the tools belong to this turn: while the model is still
 * thinking on a new prompt, the newest entry is the user's, and the previous turn's tools
 * would be a lie about what is happening now.
 */
export function liveSteps(state: ConversationState): ReadonlyArray<LiveStep> {
	const steps: LiveStep[] = [];
	const streaming = state.streaming.at(-1);
	if (streaming?.blocks.some((block) => block?.kind === "thinking") ?? false) {
		steps.push({ key: "thinking", status: "running", title: "Thinking" });
	}

	const last = state.entries.at(-1);
	if (last === undefined || last.role === "user" || last.role === "summary") return steps;
	const assistant = state.entries.findLast(
		(entry): entry is AssistantEntry => entry.role === "assistant",
	);
	if (assistant === undefined) return steps;

	for (const block of assistant.blocks) {
		if (block.type !== "toolCall") continue;
		const run = state.tools.find((tool) => tool.toolCallId === block.toolCallId);
		if (run === undefined) continue;
		steps.push({
			key: block.toolCallId,
			status: statusOf(run.status),
			title: toolTitle(block.toolName, argsOf(block.toolName, block.args)),
		});
	}
	return steps;
}
