import { SiteHeader } from "@/components/site-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
	component: function Root() {
		return (
			<TooltipProvider>
				<div className="flex h-svh flex-col">
					<SiteHeader />
					<Outlet />
				</div>
			</TooltipProvider>
		);
	},
});
