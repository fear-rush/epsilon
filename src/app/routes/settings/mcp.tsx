import { createFileRoute } from "@tanstack/react-router";

import { SectionPending } from "@/features/settings/shell/section-pending";

export const Route = createFileRoute("/settings/mcp")({
	head: () => ({ meta: [{ title: "MCP servers · Settings" }] }),
	component: () => <SectionPending title="MCP servers" />,
});
