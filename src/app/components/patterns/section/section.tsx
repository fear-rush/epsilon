import type { ReactNode } from "react";

/**
 * A titled card: a heading and an optional description over a bordered surface
 * whose children (usually `Row`s) are divided by hairlines.
 */
export function Section({
	title,
	description,
	empty,
	children,
}: {
	title?: string;
	description?: string | undefined;
	/** Shown in place of the card when there is nothing to list: an `EmptyState`. */
	empty?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<section className="grid gap-2">
			{title !== undefined && <h2 className="text-section">{title}</h2>}
			{description !== undefined && (
				<p className="text-meta text-muted-foreground">{description}</p>
			)}
			{empty === undefined ? (
				<div className="divide-y overflow-hidden rounded-card border bg-card">{children}</div>
			) : (
				empty
			)}
		</section>
	);
}
