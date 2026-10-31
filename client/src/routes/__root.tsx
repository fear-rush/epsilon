import { createRootRouteWithContext, HeadContent, Outlet } from "@tanstack/react-router";

import type { RouterContext } from "@/app/router-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppHealthBanner } from "@/features/app-shell/app-health-banner";

// The banner sits above every surface. `contain-layout` makes the surface the
// containing block of the fixed session sidebar, so the banner pushes it down
// instead of being overlapped. The context is the one Query cache, so a loader
// reaches it without importing the client.
export const Route = createRootRouteWithContext<RouterContext>()({
	head: () => ({ meta: [{ title: "Epsilon" }] }),
	component: () => (
		<TooltipProvider>
			<HeadContent />
			<div className="flex h-svh flex-col">
				<AppHealthBanner />
				<div className="relative flex min-h-0 flex-1 flex-col contain-layout">
					<Outlet />
				</div>
			</div>
		</TooltipProvider>
	),
});
