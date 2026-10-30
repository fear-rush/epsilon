/**
 * Reads one entry for an editor and draws the three states that are not the
 * form: reading, offline, and a failed read with a way back to the list. A new
 * entry (`reading` false) skips the read and renders the form with no detail.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { cn } from "cn";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { OFFLINE } from "@/api/client";

import { OfflineNotice } from "./offline-notice";
import type { MasterPath } from "./form-page";

export function DetailLoader<Detail>({
	query,
	reading,
	noun,
	backTo,
	backLabel,
	children,
}: {
	query: UseQueryResult<Detail>;
	/** False for a new entry: there is nothing to read. */
	reading: boolean;
	/** Singular, for the messages: "provider", "MCP server". */
	noun: string;
	backTo: MasterPath;
	/** Plural, after "Back to": "providers", "MCP servers". */
	backLabel: string;
	children: (detail: Detail | undefined) => ReactNode;
}) {
	if (!reading) return children(undefined);
	if (query.isPending) {
		return (
			<div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
				<Spinner />
				Reading the {noun}…
			</div>
		);
	}
	if (query.error !== null) {
		if (query.error.message === OFFLINE) return <OfflineNotice message={OFFLINE} />;
		return (
			<div className="flex h-full items-center justify-center p-6">
				<div className="grid w-full max-w-md gap-4">
					<Alert variant="destructive">
						<TriangleAlertIcon />
						<AlertTitle>This {noun} did not load</AlertTitle>
						<AlertDescription>{query.error.message}</AlertDescription>
					</Alert>
					<Link to={backTo} className={cn(buttonVariants({ variant: "outline" }), "w-fit")}>
						<ArrowLeftIcon />
						Back to {backLabel}
					</Link>
				</div>
			</div>
		);
	}
	if (query.data === undefined) return null;
	return children(query.data);
}
