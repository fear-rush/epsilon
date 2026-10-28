import { SessionSidebar } from "@/components/sessions/session-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
	component: function Root() {
		return (
			<TooltipProvider>
				<SidebarProvider>
					<SessionSidebar />
					<SidebarInset className="h-svh min-h-0 overflow-hidden">
						<Outlet />
					</SidebarInset>
				</SidebarProvider>
			</TooltipProvider>
		);
	},
});
