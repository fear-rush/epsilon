import { createRootRoute, Outlet } from "@tanstack/react-router";

import { StaleContractNotice } from "@/app/stale-contract-notice";
import { TooltipProvider } from "@/components/ui/tooltip";

export const Route = createRootRoute({
	component: () => (
		<TooltipProvider>
			<StaleContractNotice />
			<Outlet />
		</TooltipProvider>
	),
});
