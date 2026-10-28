import { createRootRoute, Outlet } from "@tanstack/react-router";

import { NotReady } from "@/components/not-ready";
import { SessionSidebar } from "@/components/sessions/session-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useReadiness } from "@/hooks/use-readiness";

export const Route = createRootRoute({
	component: function Root() {
		// A deployment with no usable model replaces every page with one notice. The
		// check is REST, so it is read once here instead of once per route.
		const readiness = useReadiness();
		const unsupported = readiness.data?.ready === false ? readiness.data : undefined;

		return (
			<TooltipProvider>
				<SidebarProvider>
					<SessionSidebar />
					<SidebarInset className="h-svh min-h-0 overflow-hidden">
						{unsupported === undefined ? <Outlet /> : <NotReady state={unsupported} />}
					</SidebarInset>
				</SidebarProvider>
			</TooltipProvider>
		);
	},
});
