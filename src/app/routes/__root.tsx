import { useIsFetching } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { RouterContext } from "@/core/router";
import { AppStatus, StatusProvider, useAppHealth } from "@/core/status";

// The status line sits above every surface and owns connection, version, chat and
// readiness problems, so a page never draws a second banner. The context is the one
// Query cache, so a loader reaches it without importing the client.
export const Route = createRootRouteWithContext<RouterContext>()({
	head: () => ({ meta: [{ title: "Epsilon" }] }),
	component: Root,
});

/**
 * Marks `<html data-ready="true">` only when the socket is open, the router is idle and no
 * query is in flight, for `bun run shoot`. A leaf that renders nothing, so a fetch
 * re-renders it alone, not the tree under `Root`.
 */
function ReadyMarker() {
	const health = useAppHealth();
	const routing = useRouterState({ select: (state) => state.status === "pending" });
	const fetching = useIsFetching();
	const ready = health === "ok" && !routing && fetching === 0;
	useEffect(() => {
		if (ready) document.documentElement.dataset["ready"] = "true";
		else delete document.documentElement.dataset["ready"];
	}, [ready]);
	return null;
}

function Root() {
	return (
		<TooltipProvider>
			<HeadContent />
			<StatusProvider>
				<ReadyMarker />
				<div className="flex h-svh flex-col">
					<AppStatus />
					<div className="relative flex min-h-0 flex-1 flex-col contain-layout">
						<Outlet />
					</div>
				</div>
			</StatusProvider>
		</TooltipProvider>
	);
}
