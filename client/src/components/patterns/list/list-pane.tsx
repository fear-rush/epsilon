import { InboxIcon, SearchIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

import { Input } from "@/components/ui/input";
import { PaneBand } from "@/components/patterns/pane/pane-band";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { PaneFooter } from "@/components/patterns/pane/pane-footer";
import { Pane } from "@/components/patterns/pane/pane";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { StatusView } from "@/components/patterns/status/status-view";
import { errorView } from "@/components/patterns/status/error-view";
import { ProjectPicker, ScopeTabs } from "@/components/patterns/tabs/scope-tabs";
import type { ScopedSection } from "@/components/patterns/tabs/scope-tabs";

/**
 * The list column of a master/detail section: a bar with the title and count, a
 * band, the rows and a footer. A section with a Global/Project scope puts the tabs
 * in the band, the project picker under it and the search below; one without puts
 * the search in the band. Footer actions fill the width, side by side when there
 * are two. The pane shows its pending, read-error and empty states in place of
 * the rows.
 */
export function ListPane({
	title,
	count,
	scope,
	notices,
	query,
	onQueryChange,
	searchLabel,
	pending,
	pendingLabel,
	error,
	empty,
	children,
	footer,
	footerStacked = false,
}: {
	title: string;
	count: number;
	/** The section whose Global/Project scope this list follows; omit for an unscoped list. */
	scope?: ScopedSection;
	/** Section-specific alerts under the band. */
	notices?: ReactNode;
	query: string;
	onQueryChange: (query: string) => void;
	searchLabel: string;
	pending: boolean;
	pendingLabel: string;
	/** A failed read, shown instead of the rows. */
	error?: Error | null;
	/** The sentence to show instead of rows, or undefined when there are rows. */
	empty: string | undefined;
	children: ReactNode;
	/** Buttons and rows under the list; each fills the width, buttons share a row. */
	footer?: ReactNode;
	/** Stack the footer's children (a switch row over a button) instead of one row. */
	footerStacked?: boolean;
}) {
	const failure = error === undefined || error === null ? undefined : errorView(error);
	const search = (
		<div className="relative w-full">
			<SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				value={query}
				placeholder={searchLabel}
				aria-label={searchLabel}
				className="pl-8"
				onChange={(event) => onQueryChange(event.target.value)}
			/>
		</div>
	);
	return (
		<Pane border className="h-full w-full">
			<PaneBar title={title} meta={count} />
			<PaneBand>{scope === undefined ? search : <ScopeTabs section={scope} />}</PaneBand>
			{scope !== undefined && <ProjectPicker section={scope} />}
			{notices !== undefined && (
				<div className="shrink-0 animate-enter-drop px-pane pt-pane enter-delay-1">{notices}</div>
			)}
			{scope !== undefined && (
				<div className="shrink-0 animate-enter-drop p-pane enter-delay-2">{search}</div>
			)}
			<div
				className={cn(
					"min-h-0 flex-1 overflow-y-auto px-pane pb-pane",
					scope === undefined && "pt-pane",
				)}
			>
				{pending ? (
					<LoadingState label={pendingLabel} />
				) : failure !== undefined ? (
					<StatusView {...failure} />
				) : empty !== undefined ? (
					<StatusView icon={InboxIcon} title={empty} />
				) : (
					children
				)}
			</div>
			{footer !== undefined && (
				<PaneFooter fill stacked={footerStacked}>
					{footer}
				</PaneFooter>
			)}
		</Pane>
	);
}
