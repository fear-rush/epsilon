import type { ReactNode } from "react";

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
import { useDisclosure } from "./use-disclosure";

/**
 * One tool call, from its input to its output. The caller decides the icon and the body;
 * this component owns the one shape every tool shares: a line that opens into it, a
 * running spinner, a failed line, and the same open/closed state as the rest of the trace.
 */
export function Tool({
	title,
	icon,
	status,
	description,
	open,
	onOpenChange,
	children,
}: {
	title: string;
	icon: ReactNode;
	status: "running" | "error" | undefined;
	description?: string | undefined;
	open?: boolean | undefined;
	onOpenChange?: ((open: boolean) => void) | undefined;
	children?: ReactNode;
}) {
	const disclosure = useDisclosure({ onOpenChange, open });
	const line = (
		<TraceLine status={status}>
			<TraceIcon>{status === undefined ? icon : <StepStatusIcon status={status} />}</TraceIcon>
			<TraceTitle>{title}</TraceTitle>
			{description === undefined ? undefined : <TraceDescription>{description}</TraceDescription>}
		</TraceLine>
	);

	if (children === undefined || children === null) return <Trace>{line}</Trace>;

	return (
		<Trace>
			<TraceCollapsible open={disclosure.open} onOpenChange={disclosure.setOpen}>
				<TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
				<TraceCollapsibleContent keepMounted>{children}</TraceCollapsibleContent>
			</TraceCollapsible>
		</Trace>
	);
}
