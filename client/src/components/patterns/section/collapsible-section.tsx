/**
 * One bordered, closed-by-default card that holds the fields most people never
 * touch. The trigger is the whole card header; the content slides open below it.
 * Pass `open` and `onOpenChange` when a validation error must open the card;
 * otherwise it keeps its own state, starting from `defaultOpen`.
 */
import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
	return (
		<Collapsible open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
			<CollapsibleTrigger className="group/override flex w-full cursor-pointer items-start justify-between gap-field rounded-xl border bg-card pad-row text-left transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
				<span className="grid gap-0.5">
					<span className="text-body font-medium">{title}</span>
					{description !== undefined && (
						<span className="text-meta text-muted-foreground">{description}</span>
					)}
				</span>
				<ChevronDownIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded/override:rotate-180" />
			</CollapsibleTrigger>
			<CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-all duration-base data-starting-style:h-0 data-ending-style:h-0">
				<div className="grid gap-card pt-4">{children}</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
