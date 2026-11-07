/**
 * One bordered, closed-by-default card that holds the fields most people never
 * touch. The trigger is the whole card header; the content slides open below it and,
 * once the height settles, the pane scrolls to the new end so the revealed fields are
 * in view. Pass `open` and `onOpenChange` when a validation error must open the card;
 * otherwise it keeps its own state, starting from `defaultOpen`.
 */
import { ChevronDownIcon } from "lucide-react";
import { useRef } from "react";
import type { ReactNode, TransitionEvent } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/** The nearest ancestor that scrolls, so a card can bring what it revealed into view. */
function scrollParentOf(element: HTMLElement): HTMLElement | undefined {
	for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
		const { overflowY } = getComputedStyle(parent);
		if (
			(overflowY === "auto" || overflowY === "scroll") &&
			parent.scrollHeight > parent.clientHeight
		) {
			return parent;
		}
	}
	return undefined;
}

/** Scroll the card's pane down until the fields it just revealed are in view. */
function revealEnd(panel: HTMLElement): void {
	const scroller = scrollParentOf(panel);
	if (scroller === undefined) return;
	const hidden = panel.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom;
	if (hidden <= 0) return;
	const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	scroller.scrollTo({
		top: Math.min(scroller.scrollTop + hidden, scroller.scrollHeight - scroller.clientHeight),
		behavior: reduced ? "auto" : "smooth",
	});
}

export function CollapsibleSection({
	title,
	description,
	open,
	onOpenChange,
	defaultOpen = false,
	children,
}: {
	title: string;
	description?: string;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	defaultOpen?: boolean;
	children: ReactNode;
}) {
	/** The card is opening: when its height settles, the pane follows to its new end. */
	const scrollAfterOpen = useRef(false);
	return (
		<Collapsible
			open={open}
			defaultOpen={defaultOpen}
			onOpenChange={(next: boolean) => {
				scrollAfterOpen.current = next;
				onOpenChange?.(next);
			}}
		>
			<CollapsibleTrigger className="group/override flex w-full items-start justify-between gap-field rounded-card border bg-card pad-row text-left transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
				<span className="grid gap-0.5">
					<span className="text-body font-medium">{title}</span>
					{description !== undefined && (
						<span className="text-meta text-muted-foreground">{description}</span>
					)}
				</span>
				<ChevronDownIcon className="mt-0.5 size-icon shrink-0 text-muted-foreground transition-transform group-aria-expanded/override:rotate-180" />
			</CollapsibleTrigger>
			<CollapsibleContent
				className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-slow ease-in-out data-ending-style:h-0 data-starting-style:h-0"
				onTransitionEnd={(event: TransitionEvent<HTMLDivElement>) => {
					if (!scrollAfterOpen.current) return;
					if (event.target !== event.currentTarget || event.propertyName !== "height") return;
					scrollAfterOpen.current = false;
					revealEnd(event.currentTarget);
				}}
			>
				<div className="grid gap-card pt-4">{children}</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
