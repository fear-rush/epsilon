import { createFileRoute } from "@tanstack/react-router";

import { asScope } from "@/features/settings/mcp/mcp-detail";
import { McpEditor } from "@/features/settings/mcp/mcp-form";

export const Route = createFileRoute("/settings/mcp/$scope/$name")({
	component: function McpServerPage() {
		const { scope, name } = Route.useParams();
		return <McpEditor scope={asScope(scope)} name={name} />;
	},
});
