import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * One row of a `Section`: a title and a muted description on the left, a control
 * on the right. `stacked` puts the control on its own full-width line.
 */
export function Row({
	title,
	description,
	stacked = false,
	children,
}: {
	title: string;
	description?: string;
	stacked?: boolean;
	children?: ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex flex-col gap-2 pad-row",
				stacked
					? "items-stretch"
					: "items-start justify-between sm:flex-row sm:items-center sm:gap-4",
			)}
		>
			<div className="min-w-0">
				<p className="truncate text-body font-medium">{title}</p>
				{description !== undefined && (
					<p className="line-clamp-2 text-meta text-muted-foreground">{description}</p>
				)}
			</div>
			{children !== undefined && (
				<div
					className={cn(
						"flex items-center gap-2",
						stacked ? "w-full" : "w-full flex-wrap sm:w-auto sm:shrink-0 sm:justify-end",
					)}
				>
					{children}
				</div>
			)}
		</div>
	);
}
