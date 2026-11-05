import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";

import { SettingsMcp } from "@/features/settings/mcp/mcp-page";

export const Route = createFileRoute("/settings/mcp")({
	head: () => ({ meta: [{ title: "MCP servers · Settings" }] }),
	component: McpRoute,
});

/**
 * The section's list, or the server page below it. The list pane that keeps both in
 * view arrives with S4's master/detail layout; until then a selected server replaces it.
 */
function McpRoute() {
	const matchRoute = useMatchRoute();
	const onServer = matchRoute({ fuzzy: true, to: "/settings/mcp/$scope/$name" }) !== false;
	return onServer ? <Outlet /> : <SettingsMcp />;
}
