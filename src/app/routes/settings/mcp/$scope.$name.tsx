import { createFileRoute } from "@tanstack/react-router";

import { asScope } from "@/features/settings/mcp/mcp-detail";
import { McpEditor } from "@/features/settings/mcp/mcp-form";

export const Route = createFileRoute("/settings/mcp/$scope/$name")({
	component: McpServerPage,
	head: ({ params }) => ({
		meta: [{ title: `${params.name} · MCP servers · Settings` }],
	}),
});

function McpServerPage() {
	const { scope, name } = Route.useParams();
	return <McpEditor name={name} scope={asScope(scope)} />;
}
