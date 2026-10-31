import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The scrolling region of a pane. `page` centres the content in the detail page
 * container, with the section gap between its children.
 */
export function PaneBody({
	page = false,
	fill = false,
	className,
	children,
}: {
	page?: boolean;
	/** The content fills the body's height (an editor) instead of scrolling. */
	fill?: boolean;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={cn("min-h-0 flex-1", fill ? "flex flex-col" : "overflow-y-auto")}>
			<div
				className={cn(
					page && "mx-auto grid w-full max-w-content animate-enter-rise gap-section px-page py-6",
					fill && "flex min-h-0 flex-1 flex-col",
					className,
				)}
			>
				{children}
			</div>
		</div>
	);
}
