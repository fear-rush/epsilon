import type { RunRow, RunStep, ToolCount } from "#domain/conversation/selectors";
import { ChainOfThought } from "@/components/ai-elements/chain-of-thought";
import { Reasoning } from "@/components/ai-elements/reasoning";

import { ToolTrace } from "./tool-trace";

/**
 * One run of work: every message the agent sent between two boundaries, where a message
 * that only called tools is a step and one that wrote text ends the run.
 *
 * pi's loop sends one assistant message per tool call, so a single stretch of work arrives
 * as dozens of messages. A row each turns the transcript into a ladder of headings that
 * say the same thing; one row per run says what the work was, keeps the steps behind it,
 * and keeps a failure on the closed line.
 */

/** The words under a run's title: what it did, not how many messages it took. */
const countLabel = (entry: ToolCount): string => {
	switch (entry.category) {
		case "command":
			return entry.count === 1 ? "1 command" : `${entry.count} commands`;
		case "read":
			return entry.count === 1 ? "1 read" : `${entry.count} reads`;
		case "search":
			return entry.count === 1 ? "1 search" : `${entry.count} searches`;
		case "edit":
			return entry.count === 1 ? "1 edit" : `${entry.count} edits`;
		default:
			return `${entry.category} ×${entry.count}`;
	}
};

const countsLabel = (counts: ReadonlyArray<ToolCount>): string =>
	counts.map(countLabel).join(" · ");

function RunStepView({
	step,
	open,
	onToggle,
}: {
	step: RunStep;
	open: boolean | undefined;
	onToggle: () => void;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			{/* The same line an answer's thinking uses: one label, one quoted first line. */}
			<Reasoning text={step.thinking} running={false} />
			<ToolTrace
				args={step.call.args}
				name={step.call.toolName}
				open={open}
				run={step.run}
				onToggle={onToggle}
			/>
		</div>
	);
}

export function RunCard({
	row,
	toolOpen,
	onToggleTool,
}: {
	row: RunRow;
	toolOpen: ReadonlyMap<string, boolean>;
	onToggleTool: (toolCallId: string) => void;
}) {
	const stepViews = row.steps.map((step) => (
		<RunStepView
			key={step.call.toolCallId}
			step={step}
			open={toolOpen.get(step.call.toolCallId)}
			onToggle={() => onToggleTool(step.call.toolCallId)}
		/>
	));
	// A run of one call is one line: a heading over a single step would say less than the
	// step itself, which is the heading the transcript used to repeat on every message.
	const only = row.steps[0];
	if (row.steps.length === 1 && only !== undefined) {
		return (
			<RunStepView
				step={only}
				open={toolOpen.get(only.call.toolCallId)}
				onToggle={() => onToggleTool(only.call.toolCallId)}
			/>
		);
	}
	return (
		<ChainOfThought
			title={`${row.running ? "Running" : "Ran"} ${row.steps.length} steps`}
			description={countsLabel(row.counts)}
			failed={row.failed}
			defaultOpen={row.failed > 0}
			status={row.running ? "running" : row.failed > 0 ? "error" : undefined}
		>
			{stepViews}
		</ChainOfThought>
	);
}
