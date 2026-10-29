/**
 * The provider editor: a list on the left, the selected provider on the right.
 * The list is a route target as well, so Back and a deep link both work. The
 * route owns which provider is selected; the panel only draws it.
 */
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { cn } from "cn";

import { ProvidersPanel } from "@/components/settings/providers/providers-panel";

export const Route = createFileRoute("/settings/providers")({
	component: function ProvidersLayout() {
		const matchRoute = useMatchRoute();
		const matched = matchRoute({ to: "/settings/providers/$providerId" });
		const selectedId = matched === false ? undefined : matched.providerId;
		const adding = matchRoute({ to: "/settings/providers/new" }) !== false;
		const editing = selectedId !== undefined || adding;
		return (
			<div className="flex h-full min-h-0">
				<ProvidersPanel selectedId={selectedId} editing={editing} />
				<div
					className={cn(
						"flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
						!editing && "hidden md:block",
					)}
				>
					<Outlet />
				</div>
			</div>
		);
	},
});
