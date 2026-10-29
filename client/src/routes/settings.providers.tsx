/**
 * The provider editor: a list on the left, the selected provider on the right.
 * The list is a route target as well, so Back and a deep link both work.
 */
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { cn } from "cn";

import { ProvidersPanel } from "@/components/settings/providers/providers-panel";

export const Route = createFileRoute("/settings/providers")({
	component: function ProvidersLayout() {
		const pathname = useLocation({ select: (location) => location.pathname });
		const selected = pathname !== "/settings/providers" && pathname !== "/settings/providers/";
		return (
			<div className="flex h-full min-h-0">
				<ProvidersPanel />
				<div
					className={cn(
						"flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
						!selected && "hidden md:block",
					)}
				>
					<Outlet />
				</div>
			</div>
		);
	},
});
