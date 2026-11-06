import {
	CircleAlertIcon,
	CircleCheckIcon,
	CircleDotIcon,
	CircleIcon,
	LoaderCircleIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";

/** The four states a step can be in while an agent works. */
export type StepStatus = "running" | "done" | "error" | "pending";

/**
 * One icon per step state, shared by every AI element that draws steps. A running step
 * spins; the rest keep the same size so a list does not move when a state changes.
 */
export function StepStatusIcon({
	status,
	className,
}: {
	status: StepStatus | undefined;
	className?: string;
}) {
	if (status === "running") {
		return <LoaderCircleIcon className={cn("animate-spin", className)} />;
	}
	if (status === "pending") return <CircleIcon className={className} />;
	if (status === "error") return <CircleAlertIcon className={className} />;
	return status === "done" ? (
		<CircleCheckIcon className={className} />
	) : (
		<CircleDotIcon className={className} />
	);
}
