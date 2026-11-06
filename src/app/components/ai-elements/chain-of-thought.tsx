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

import { StepStatusIcon } from "./status-icon";

/**
 * A run of work that expands into its steps. The summary is a line like "Ran 8 steps" with
 * what it did beside it, and a failed count while it is closed; the steps themselves stay
 * mounted, so a tool the reader opened is still open when the run is opened again. It
 * starts open while the work runs and closes once the agent starts answering.
 */
export function ChainOfThought({
	title,
	description,
	failed,
	status,
	defaultOpen = false,
	children,
}: {
	title: string;
	description?: string | undefined;
	/** Steps that failed, which the summary keeps visible while it is closed. */
	failed?: number | undefined;
	status: "running" | "error" | undefined;
	/** Open a finished chain, such as one that failed. */
	defaultOpen?: boolean;
	children: ReactNode;
}) {
	const [open, setOpen] = useState<boolean>();
	const running = status === "running";

	return (
		<Trace>
			<TraceCollapsible open={open ?? (running || defaultOpen)} onOpenChange={setOpen}>
				<TraceCollapsibleTrigger>
					<TraceLine status={status}>
						<TraceIcon>
							<StepStatusIcon status={status ?? "done"} />
						</TraceIcon>
						<TraceTitle>{title}</TraceTitle>
						{description === undefined ? undefined : (
							<TraceDescription>{description}</TraceDescription>
						)}
						{failed === undefined || failed === 0 ? undefined : (
							<span className="shrink-0 text-destructive tabular-nums">{failed} failed</span>
						)}
					</TraceLine>
				</TraceCollapsibleTrigger>
				<TraceCollapsibleContent keepMounted>
					<div className="flex min-w-0 flex-col gap-2">{children}</div>
				</TraceCollapsibleContent>
			</TraceCollapsible>
		</Trace>
	);
}
