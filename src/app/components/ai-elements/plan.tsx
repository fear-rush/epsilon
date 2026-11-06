import { type ReactNode, useState } from "react";

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

export type PlanStep = {
	readonly key: string;
	readonly title: string;
	readonly status: StepStatus;
};

/** The status a step line shows: a done step has no state of its own. */
const lineStatus = (status: StepStatus): "running" | "error" | "pending" | undefined => {
	if (status === "done") return undefined;
	return status;
};

/**
 * The steps the agent said it would take, and how far it has got. A plan is known before
 * the work starts, so every step is here from the beginning; the count says how many are
 * done. It opens while a step runs and can be opened again afterwards.
 */
export function Plan({
	title,
	steps,
	defaultOpen = false,
	children,
}: {
	title: string;
	steps: ReadonlyArray<PlanStep>;
	/** Open a finished plan, such as one with a failed step. */
	defaultOpen?: boolean;
	/** Extra detail under the steps, such as the calls themselves. */
	children?: ReactNode;
}) {
	const [open, setOpen] = useState<boolean>();
	const done = steps.filter((step) => step.status === "done").length;
	const running = steps.some((step) => step.status === "running");
	const failed = steps.some((step) => step.status === "error");
	const status: "running" | "error" | undefined = running
		? "running"
		: failed
			? "error"
			: undefined;

	return (
		<Trace>
			<TraceCollapsible open={open ?? (running || defaultOpen)} onOpenChange={setOpen}>
				<TraceCollapsibleTrigger>
					<TraceLine status={status}>
						<TraceIcon>
							<StepStatusIcon status={status ?? "done"} />
						</TraceIcon>
						<TraceTitle>{title}</TraceTitle>
						{steps.length === 0 ? undefined : (
							<TraceDescription>
								{done} of {steps.length} done
							</TraceDescription>
						)}
					</TraceLine>
				</TraceCollapsibleTrigger>
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
					{children}
				</TraceCollapsibleContent>
			</TraceCollapsible>
		</Trace>
	);
}
