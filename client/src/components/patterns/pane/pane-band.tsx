import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

import { GUTTER_CLASS } from "./gutter";
import type { Gutter } from "./gutter";

/**
 * The strip under a bar that holds a pane's tabs or search. It draws no rule:
 * the bar's is the only line across the columns.
 */
export function PaneBand({
	gutter = "pane",
	className,
	children,
}: {
	gutter?: Gutter;
	className?: string;
	children?: ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex h-band shrink-0 animate-enter-drop items-center enter-delay-1",
				GUTTER_CLASS[gutter],
				className,
			)}
		>
			{children}
		</div>
	);
}
