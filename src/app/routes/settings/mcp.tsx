import { createFileRoute } from "@tanstack/react-router";

import { SettingsMcp } from "@/features/settings/mcp/mcp-page";

export const Route = createFileRoute("/settings/mcp")({
	head: () => ({ meta: [{ title: "MCP servers · Settings" }] }),
	component: SettingsMcp,
});
