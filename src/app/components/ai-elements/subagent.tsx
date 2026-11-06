import type { ReactNode } from "react";

import {
	Trace,
	TraceCollapsible,
	TraceCollapsibleContent,
	TraceCollapsibleTrigger,
	TraceIcon,
	TraceLine,
	TraceTitle,
} from "@/components/ui/trace";

import { StepStatusIcon, type StepStatus } from "./status-icon";
import { useDisclosure } from "./use-disclosure";

export type SubagentCall = {
	readonly key: string;
	readonly name: string;
	/** The call's status, with a one-line result when it has one. */
	readonly status: StepStatus;
	readonly detail: string;
};

const lineStatus = (status: StepStatus): "running" | "error" | undefined => {
	if (status === "running" || status === "error") return status;
	return undefined;
};

/**
 * A subagent run: the calls it made and the result it reported. Epsilon receives those
 * calls as codemode's nested rows, so the section opens with the subagent's own work
 * rather than repeating it as top-level tool cards.
 */
export function Subagent({
	name,
	status,
	calls,
	open,
	onOpenChange,
	children,
}: {
	name: string;
	status: "running" | "error" | undefined;
	calls: ReadonlyArray<SubagentCall>;
	open?: boolean | undefined;
	onOpenChange?: ((open: boolean) => void) | undefined;
	/** The subagent's result, or the output of the call that ran it. */
	children?: ReactNode;
}) {
	const disclosure = useDisclosure({
		defaultOpen: status === "running",
		onOpenChange,
		open,
	});
	const title =
		status === "running"
			? `Running the ${name} subagent`
			: status === "error"
				? `Failed to run the ${name} subagent`
				: `Ran the ${name} subagent`;
	const line = (
		<TraceLine status={status}>
			<TraceIcon>
				<StepStatusIcon status={status ?? "done"} />
			</TraceIcon>
			<TraceTitle>{title}</TraceTitle>
		</TraceLine>
	);

	return (
		<Trace>
			<TraceCollapsible open={disclosure.open} onOpenChange={disclosure.setOpen}>
				<TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
				<TraceCollapsibleContent keepMounted>
					<div className="flex min-w-0 flex-col gap-2">
						{calls.length === 0 ? undefined : (
							<Trace>
								{calls.map((call) => (
									<TraceLine key={call.key} status={lineStatus(call.status)}>
										<TraceIcon>
											<StepStatusIcon status={call.status} />
										</TraceIcon>
										<TraceTitle>
											{call.name}
											{call.detail === "" ? "" : `: ${call.detail}`}
										</TraceTitle>
									</TraceLine>
								))}
							</Trace>
						)}
						{children}
					</div>
				</TraceCollapsibleContent>
			</TraceCollapsible>
		</Trace>
	);
}
