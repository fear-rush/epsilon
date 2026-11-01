import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

import { GUTTER_CLASS } from "./gutter";
import type { Gutter } from "./gutter";

/**
 * The strip under a bar that holds a pane's tabs or search. It draws no rule:
 * the bar's is the only line across the columns. A pane gives it the entrance its
 * own reveal uses.
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
		<div className={cn("flex h-band shrink-0 items-center", GUTTER_CLASS[gutter], className)}>
			{children}
		</div>
	);
}
