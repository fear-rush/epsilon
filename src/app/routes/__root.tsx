import { useIsFetching } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";

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

/** True only when the socket is open, the router is idle and no query is in flight. */
function useReady(): boolean {
	const health = useAppHealth();
	const routing = useRouterState({ select: (state) => state.status === "pending" });
	const fetching = useIsFetching();
	return health === "ok" && !routing && fetching === 0;
}

function Root() {
	const ready = useReady();
	return (
		<TooltipProvider>
			<HeadContent />
			<StatusProvider>
				<div className="flex h-svh flex-col" data-ready={ready ? "true" : undefined}>
					<AppStatus />
					<div className="relative flex min-h-0 flex-1 flex-col contain-layout">
						<Outlet />
					</div>
				</div>
			</StatusProvider>
		</TooltipProvider>
	);
}
