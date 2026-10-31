import type { ReactNode } from "react";

/**
 * An optional title, then rows. The single `minmax(0,1fr)` column lets a long
 * name truncate instead of widening the list (the lint allows this one bracket).
 * A group after another draws a rule that runs full bleed across the list's
 * gutters.
 */
export function ListGroup({ title, children }: { title?: string; children: ReactNode }) {
	return (
		<section className="-mx-pane grid grid-cols-[minmax(0,1fr)] gap-row border-t px-pane py-2 first:mx-0 first:border-t-0 first:px-0 first:pt-0">
			{title !== undefined && (
				<h3 className="px-2 py-1 text-meta font-medium text-muted-foreground">{title}</h3>
			)}
			{children}
		</section>
	);
}
