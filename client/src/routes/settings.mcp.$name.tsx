import { createFileRoute } from "@tanstack/react-router";

import { McpEditor } from "@/components/settings/mcp/mcp-editor";

export const Route = createFileRoute("/settings/mcp/$name")({
	component: function McpServerPage() {
		const { name } = Route.useParams();
		return <McpEditor name={name} />;
	},
});
