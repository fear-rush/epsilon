import type { ReactNode } from "react";

/**
 * A titled card: a heading and an optional description over a bordered surface
 * whose children (usually `Row`s) are divided by hairlines.
 */
export function Section({
	title,
	description,
	children,
}: {
	title?: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<section className="grid gap-2">
			{title !== undefined && <h2 className="text-section">{title}</h2>}
			{description !== undefined && (
				<p className="text-meta text-muted-foreground">{description}</p>
			)}
			<div className="divide-y overflow-hidden rounded-xl border bg-card">{children}</div>
		</section>
	);
}
