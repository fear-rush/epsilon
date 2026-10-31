import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

import { GUTTER_CLASS } from "./gutter";
import type { Gutter } from "./gutter";

/** The fixed row under a pane's body: status text on the left, actions on the right. */
export function PaneFooter({
	status,
	gutter = "pane",
	stacked = false,
	fill = false,
	className,
	children,
}: {
	status?: ReactNode;
	gutter?: Gutter;
	/** The actions share the full width equally, for a list pane's footer. */
	fill?: boolean;
	/** The children fill the width and stack, for a switch row over a button. */
	stacked?: boolean;
	className?: string;
	children?: ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex shrink-0 animate-enter-rise items-center gap-2 border-t py-3 enter-delay-2",
				GUTTER_CLASS[gutter],
				className,
			)}
		>
			{status !== undefined && (
				<div className="min-w-0 truncate text-meta text-muted-foreground">{status}</div>
			)}
			{children !== undefined &&
				(stacked ? (
					<div className="grid w-full gap-3 *:w-full">{children}</div>
				) : fill ? (
					<div className="grid w-full auto-cols-fr grid-flow-col gap-2 *:w-full">{children}</div>
				) : (
					<div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>
				))}
		</div>
	);
}
