import { useState } from "react";

import {
	Trace,
	TraceCollapsible,
	TraceCollapsibleContent,
	TraceCollapsibleTrigger,
	TraceDescription,
	TraceIcon,
	TraceLine,
	TraceTitle,
} from "@/components/ui/trace";

import { StepStatusIcon, type StepStatus } from "./status-icon";

export type TaskStep = {
	readonly key: string;
	readonly title: string;
	readonly status: StepStatus;
};

/** A done step has no state of its own; the others keep their colour and motion. */
const lineStatus = (status: StepStatus): "running" | "error" | "pending" | undefined => {
	if (status === "done") return undefined;
	return status;
};

/**
 * The steps the agent takes as it takes them. Unlike a plan, the steps are not known up
 * front: each one appears when the work reaches it. The line says what is being done now
 * and stays open while the task runs.
 */
export function Task({
	title,
	status,
	steps,
	defaultOpen = true,
}: {
	title: string;
	status: "running" | "error" | undefined;
	steps: ReadonlyArray<TaskStep>;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState<boolean>();
	const done = steps.filter((step) => step.status === "done").length;
	const summary = (
		<TraceLine status={status}>
			<TraceIcon>
				<StepStatusIcon status={status ?? "done"} />
			</TraceIcon>
			<TraceTitle>{title}</TraceTitle>
			{steps.length === 0 ? undefined : (
				<TraceDescription>
					{done} of {steps.length}
				</TraceDescription>
			)}
		</TraceLine>
	);

	if (steps.length === 0) return <Trace>{summary}</Trace>;

	return (
		<Trace>
			<TraceCollapsible open={open ?? (status === "running" || defaultOpen)} onOpenChange={setOpen}>
				<TraceCollapsibleTrigger>{summary}</TraceCollapsibleTrigger>
				<TraceCollapsibleContent keepMounted>
					<Trace>
						{steps.map((step) => (
							<TraceLine key={step.key} status={lineStatus(step.status)}>
								<TraceIcon>
									<StepStatusIcon status={step.status} />
								</TraceIcon>
								<TraceTitle>{step.title}</TraceTitle>
							</TraceLine>
						))}
					</Trace>
				</TraceCollapsibleContent>
			</TraceCollapsible>
		</Trace>
	);
}
