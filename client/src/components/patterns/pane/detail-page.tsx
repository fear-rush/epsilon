import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

import { buttonVariants } from "@/components/ui/button";

import { Pane } from "./pane";
import { PaneBand } from "./pane-band";
import { PaneBar } from "./pane-bar";
import { PaneBody } from "./pane-body";
import { PaneFooter } from "./pane-footer";

/**
 * A detail column: the title bar with its actions, a tabs band when the page has
 * tabs, the scrolling body and an optional footer. On a phone a back link joins the bar.
 */
export function DetailPage({
	title,
	actions,
	tabs,
	back,
	footer,
	footerStatus,
	fill = false,
	bodyKey,
	children,
}: {
	title: ReactNode;
	actions?: ReactNode;
	/** The Form/Raw tabs; omit and the page has no band. */
	tabs?: ReactNode;
	/** Where the phone back link goes, as a path of the section's list. */
	back?: { to: ComponentProps<typeof Link>["to"]; label: string };
	/** The footer's actions; omit with no `footerStatus` for no footer. */
	footer?: ReactNode;
	footerStatus?: ReactNode;
	/** The body holds one editor that fills its height. */
	fill?: boolean;
	/** The open tab: a new key remounts the body, so switching tabs replays its entrance. */
	bodyKey?: string;
	children: ReactNode;
}) {
	return (
		<Pane className="flex-1">
			<PaneBar
				gutter="page"
				title={title}
				actions={actions}
				leading={
					back !== undefined && (
						<Link
							to={back.to}
							aria-label={back.label}
							className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "md:hidden")}
						>
							<ChevronLeftIcon />
						</Link>
					)
				}
			/>
			{tabs !== undefined && (
				// The tabs sit in the same column as the page's content, not at the pane's edge.
				<PaneBand gutter="page" className="px-0">
					<div className="mx-auto w-full max-w-content px-page">{tabs}</div>
				</PaneBand>
			)}
			<PaneBody key={bodyKey} page fill={fill}>
				{children}
			</PaneBody>
			{(footer !== undefined || footerStatus !== undefined) && (
				<PaneFooter gutter="page" status={footerStatus}>
					{footer}
				</PaneFooter>
			)}
		</Pane>
	);
}
