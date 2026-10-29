import { createRootRoute, Outlet, useLocation } from "@tanstack/react-router";

import { NotReady } from "@/components/not-ready";
import { SessionSidebar } from "@/components/sessions/session-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
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
		// Do not mount a session route (and therefore an engine) until the answer is
		// in. An unconfigured home must show its notice first, not build an engine.
		const checking = !inSettings && readiness.isPending;

		return (
			<TooltipProvider>
				{inSettings ? (
					<Outlet />
				) : (
					<SidebarProvider>
						<SessionSidebar />
						<SidebarInset className="h-svh min-h-0 overflow-hidden">
							{checking ? (
								<div className="flex flex-1 items-center justify-center">
									<Spinner className="text-muted-foreground" />
								</div>
							) : unsupported === undefined ? (
								<Outlet />
							) : (
								<NotReady state={unsupported} />
							)}
						</SidebarInset>
					</SidebarProvider>
				)}
			</TooltipProvider>
		);
	},
});
