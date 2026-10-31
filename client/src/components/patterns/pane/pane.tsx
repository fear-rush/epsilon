import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** One column of a layout: a flex column that never outgrows its parent. */
export function Pane({
	border = false,
	className,
	children,
}: {
	/** Draws the divider on the column's right edge. */
	border?: boolean;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={cn("flex min-h-0 min-w-0 flex-col bg-background", border && "border-r", className)}
		>
			{children}
		</div>
	);
}
