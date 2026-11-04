import { InboxIcon } from "lucide-react";
import type { ReactNode } from "react";

import { SearchField } from "@/components/patterns/list/search-field";
import { Pane } from "@/components/patterns/pane/pane";
import { PaneBand } from "@/components/patterns/pane/pane-band";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { PaneFooter } from "@/components/patterns/pane/pane-footer";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { StatusView } from "@/components/patterns/status/status-view";
import { ProjectPicker, ScopeTabs } from "@/components/patterns/tabs/scope-tabs";
import type { ScopedSection } from "@/components/patterns/tabs/scope-tabs";
import { useSettingsProject } from "@/features/settings/queries.ts";
import { cn } from "@/lib/cn";

/**
 * The list column of a master/detail section: a bar with the title and count, a
 * band, the rows and a footer. A section with a Global/Project scope puts the tabs
 * in the band, the project picker under it and the search below; one without puts
 * the search in the band. Every piece under the bar starts `pane` below the one
 * before it, and a scope switch slides the whole content in from that side. Footer
 * actions fill the width, side by side when there are two. The pane shows its
 * pending, read-error and empty states in place of the rows.
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
	const search = <SearchField value={query} onChange={onQueryChange} label={searchLabel} />;
	// The band already ends `pane` below its tabs or search; this stack's rows are `pane` apart,
	// so the space under the bar is the same whether a scope, notices or neither are shown.
	const stack = scope !== undefined || notices !== undefined;
	const project = useSettingsProject();
	// A scope switch keeps this pane mounted, so the scrolling content is keyed by the chosen
	// project: every switch replays its entrance, from the left for Global and the right for a
	// project, whether it shows rows, a notice or an empty state.
	const contentKey = scope === undefined ? undefined : (project ?? "global");
	const contentEnter = project === undefined ? "animate-enter-left" : "animate-enter-right";
	return (
		<Pane border className="h-full w-full">
			{/* The count arrives with the rows, so it drops in once instead of flashing 0. */}
			<PaneBar title={title} meta={pending ? undefined : count} />
			<PaneBand className="animate-enter-drop enter-delay-1">
				{scope === undefined ? search : <ScopeTabs section={scope} />}
			</PaneBand>
			{stack && (
				<div className="grid shrink-0 animate-enter-drop gap-pane px-pane enter-delay-2">
					{scope !== undefined && <ProjectPicker section={scope} />}
					{notices !== undefined && <div>{notices}</div>}
					{scope !== undefined && search}
				</div>
			)}
			{/* The clip keeps the entrance inside the column: the content slides in from its edge. */}
			<div className="min-h-0 flex-1 overflow-hidden">
				<div
					key={contentKey}
					className={cn(
						"h-full w-full overflow-y-auto px-pane pb-pane",
						stack && "pt-pane",
						scope !== undefined && contentEnter,
					)}
				>
					{pending ? (
						<LoadingState label={pendingLabel} />
					) : failure === undefined ? (
						empty === undefined ? (
							children
						) : (
							<StatusView icon={InboxIcon} title={empty} />
						)
					) : (
						<StatusView {...failure} />
					)}
				</div>
			</div>
			{footer !== undefined && (
				<PaneFooter fill stacked={footerStacked} className="animate-enter-rise enter-delay-2">
					{footer}
				</PaneFooter>
			)}
		</Pane>
	);
}
