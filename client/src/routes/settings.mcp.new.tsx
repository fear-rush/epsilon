import { createFileRoute } from "@tanstack/react-router";

import { McpEditor } from "@/components/settings/mcp/mcp-editor";

export const Route = createFileRoute("/settings/mcp/new")({
	component: function NewMcpServerPage() {
		return <McpEditor />;
	},
});
