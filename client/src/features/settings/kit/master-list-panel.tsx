/**
 * The left pane of a master/detail section: a titled header with a count, the
 * snapshot's read problem, a search box, the list itself and an add action.
 * The section supplies the rows; on a phone the pane gives way to the editor
 * while an entry is open.
 */
import { TriangleAlertIcon, SearchIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function MasterListPanel({
	title,
	count,
	editing,
	error,
	notices,
	query,
	onQueryChange,
	searchLabel,
	pending,
	pendingLabel,
	empty,
	children,
	footer,
}: {
	title: string;
	count: number;
	editing: boolean;
	/** The snapshot's read problem, if the agent home could not be read whole. */
	error: string | undefined;
	/** Section-specific alerts that sit under the header. */
	notices?: ReactNode;
	query: string;
	onQueryChange: (query: string) => void;
	searchLabel: string;
	pending: boolean;
	pendingLabel: string;
	/** The sentence to show instead of rows, or undefined when there are rows. */
	empty: string | undefined;
	children: ReactNode;
	footer: ReactNode;
}) {
	return (
		<aside
			className={cn(
				"w-full shrink-0 flex-col border-r bg-background md:flex md:w-80",
				editing ? "hidden md:flex" : "flex",
			)}
		>
			<div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
				<span className="text-sm font-medium">{title}</span>
				<span className="text-xs text-muted-foreground">{count}</span>
			</div>
			{error !== undefined && (
				<div className="shrink-0 px-3 py-2">
					<Alert variant="destructive">
						<TriangleAlertIcon />
						<AlertDescription className="max-h-32 overflow-auto whitespace-pre-wrap text-xs">
							{error}
						</AlertDescription>
					</Alert>
				</div>
			)}
			{notices}
			<div className="shrink-0 p-3">
				<div className="relative">
					<SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={query}
						placeholder={searchLabel}
						aria-label={searchLabel}
						className="pl-8"
						onChange={(event) => onQueryChange(event.target.value)}
					/>
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
				{pending ? (
					<div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
						<Spinner />
						{pendingLabel}
					</div>
				) : empty !== undefined ? (
					<p className="px-2 py-3 text-xs text-muted-foreground">{empty}</p>
				) : (
					children
				)}
			</div>
			<div className="shrink-0 border-t p-3">{footer}</div>
		</aside>
	);
}
