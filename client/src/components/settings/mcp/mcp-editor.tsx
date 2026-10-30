/**
 * One MCP server route: read the entry, then render its form. A new server skips
 * the read and starts from an empty draft.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "cn";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { OfflineNotice } from "@/components/settings/offline-notice";
import { useMcpServer } from "@/hooks/use-mcp-server";
import { OFFLINE } from "@/lib/api";

import { McpForm } from "./mcp-form";

export function McpEditor({ name }: { name?: string }) {
	const detail = useMcpServer(name);
	if (name !== undefined) {
		if (detail.isPending) {
			return (
				<div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
					<Spinner />
					Reading the MCP server…
				</div>
			);
		}
		if (detail.error !== null) {
			if (detail.error.message === OFFLINE) return <OfflineNotice message={OFFLINE} />;
			return (
				<div className="flex h-full items-center justify-center p-6">
					<div className="grid w-full max-w-md gap-4">
						<Alert variant="destructive">
							<TriangleAlertIcon />
							<AlertTitle>This MCP server did not load</AlertTitle>
							<AlertDescription>{detail.error.message}</AlertDescription>
						</Alert>
						<Link
							to="/settings/mcp"
							className={cn(buttonVariants({ variant: "outline" }), "w-fit")}
						>
							<ArrowLeftIcon />
							Back to MCP servers
						</Link>
					</div>
				</div>
			);
		}
		if (detail.data === undefined) return null;
		return <McpForm key={detail.data.name} detail={detail.data} />;
	}
	return <McpForm detail={undefined} />;
}
