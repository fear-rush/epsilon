/**
 * The MCP editor: a list on the left, the selected server on the right. The list
 * is a route target as well, so Back and a deep link both work. The route owns
 * which server is selected; the panel only draws it.
 */
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { cn } from "cn";
import type { McpScope } from "shared";

import { OfflineNotice } from "@/components/settings/offline-notice";
import { McpPanel } from "@/components/settings/mcp/mcp-panel";
import { useSettings } from "@/hooks/use-settings";

const asScope = (value: string): McpScope => (value === "project" ? "project" : "global");

export const Route = createFileRoute("/settings/mcp")({
	component: function McpLayout() {
		const matchRoute = useMatchRoute();
		const settings = useSettings();
		const matched = matchRoute({ to: "/settings/mcp/$scope/$name" });
		const selected =
			matched === false ? undefined : { scope: asScope(matched.scope), name: matched.name };
		const adding = matchRoute({ to: "/settings/mcp/$scope/new" }) !== false;
		const editing = selected !== undefined || adding;
		if (settings.error !== null) return <OfflineNotice message={settings.error.message} />;
		return (
			<div className="flex h-full min-h-0">
				<McpPanel selected={selected} editing={editing} />
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
