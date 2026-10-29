import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";

import { NotReady } from "@/components/not-ready";
import { SessionSidebar } from "@/components/sessions/session-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useReadiness } from "@/hooks/use-readiness";

export const Route = createRootRoute({
	component: function Root() {
		// Settings is its own full-page surface, so it bypasses the session shell.
		const pathname = useLocation({ select: (location) => location.pathname });
		const inSettings = pathname === "/settings" || pathname.startsWith("/settings/");
		// A deployment with no usable model replaces every other page with one
		// notice. The check is REST, so it is read once here instead of once per
		// route; Settings stays reachable so the notice has somewhere to send you.
		const readiness = useReadiness({ enabled: !inSettings });
		const unsupported = readiness.data?.ready === false ? readiness.data : undefined;

		return (
			<TooltipProvider>
				{inSettings ? (
					<Outlet />
				) : (
					<SidebarProvider>
						<SessionSidebar />
						<SidebarInset className="h-svh min-h-0 overflow-hidden">
							{unsupported === undefined ? <Outlet /> : <NotReady state={unsupported} />}
						</SidebarInset>
					</SidebarProvider>
				)}
			</TooltipProvider>
		);
	},
});
