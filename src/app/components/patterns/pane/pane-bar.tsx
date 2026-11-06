import { isValidElement } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { GUTTER_CLASS } from "./gutter";
import type { Gutter } from "./gutter";

/**
 * The first row of every column: a fixed-height bar with a truncating title, an
 * optional meta (a count) beside it and actions on the right. Every column's bar
 * shares one height, so their rules line up. The title and the count drop in from
 * above, and drop again when their text changes, because the bar stays while the
 * page under it changes.
 */

/** A text child can be a key, so a new value re-plays its entrance; a node cannot. */
const textKey = (value: ReactNode): string | undefined =>
	value === undefined || isValidElement(value) ? undefined : String(value);
export function PaneBar({
	title,
	meta,
	actions,
	leading,
	gutter = "pane",
	column = false,
	className,
}: {
	title?: ReactNode;
	/** Quiet text after the title, such as a count. */
	meta?: ReactNode;
	actions?: ReactNode;
	/** Before the title, such as a back link. */
	leading?: ReactNode;
	gutter?: Gutter;
	/** Lay the bar out in the page's content column, so a form page's title shares its left edge. */
	column?: boolean;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex h-bar shrink-0 animate-enter-fade items-center border-b",
				column ? "justify-center" : cn("gap-2", GUTTER_CLASS[gutter]),
				className,
			)}
		>
			<div
				className={cn(
					"flex h-full min-w-0 items-center gap-2",
					column && "mx-auto w-full max-w-content px-page",
					!column && "w-full",
				)}
			>
				{leading}
				{title !== undefined && (
					<h2 key={textKey(title)} className="min-w-0 animate-enter-drop truncate text-title">
						{title}
					</h2>
				)}
				{meta !== undefined && (
					<span
						key={textKey(meta)}
						className="shrink-0 animate-enter-drop text-meta text-muted-foreground"
					>
						{meta}
					</span>
				)}
				{actions !== undefined && (
					<div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
				)}
			</div>
		</div>
	);
}
