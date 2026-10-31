import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

import { GUTTER_CLASS } from "./gutter";
import type { Gutter } from "./gutter";

/**
 * The first row of every column: a fixed-height bar with a truncating title, an
 * optional meta (a count) beside it and actions on the right. Every column's bar
 * shares one height, so their rules line up.
 */
export function PaneBar({
	title,
	meta,
	actions,
	leading,
	gutter = "pane",
	className,
}: {
	title?: ReactNode;
	/** Quiet text after the title, such as a count. */
	meta?: ReactNode;
	actions?: ReactNode;
	/** Before the title, such as a back link. */
	leading?: ReactNode;
	gutter?: Gutter;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex h-bar shrink-0 animate-enter-fade items-center gap-2 border-b",
				GUTTER_CLASS[gutter],
				className,
			)}
		>
			{leading}
			{title !== undefined && <h2 className="min-w-0 truncate text-title">{title}</h2>}
			{meta !== undefined && (
				<span className="shrink-0 text-meta text-muted-foreground">{meta}</span>
			)}
			{actions !== undefined && (
				<div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
			)}
		</div>
	);
}
