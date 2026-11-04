import { createRootRouteWithContext, HeadContent, Outlet } from "@tanstack/react-router";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { RouterContext } from "@/core/router";
import { AppStatus, StatusProvider } from "@/core/status";

// The status line sits above every surface and owns connection, version, chat and
// readiness problems, so a page never draws a second banner. The context is the one
// Query cache, so a loader reaches it without importing the client.
export const Route = createRootRouteWithContext<RouterContext>()({
	head: () => ({ meta: [{ title: "Epsilon" }] }),
	component: Root,
});

function Root() {
	return (
		<TooltipProvider>
			<HeadContent />
			<StatusProvider>
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
