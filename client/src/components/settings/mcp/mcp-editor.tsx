/**
 * One MCP server route: read the entry from the file its scope names, then render
 * its form. A new server skips the read and starts from an empty draft.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "cn";
import type { McpScope } from "shared";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { OfflineNotice } from "@/components/settings/offline-notice";
import { useMcpServer } from "@/hooks/use-mcp-server";
import { OFFLINE } from "@/lib/api";

import { McpForm } from "./mcp-form";

export function McpEditor({ scope, name }: { scope: McpScope; name?: string }) {
	const detail = useMcpServer(scope, name);
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
		return <McpForm key={`${scope}\0${detail.data.name}`} detail={detail.data} scope={scope} />;
	}
	return <McpForm detail={undefined} scope={scope} />;
}
