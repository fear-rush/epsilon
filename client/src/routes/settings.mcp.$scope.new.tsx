import { createFileRoute } from "@tanstack/react-router";

import { asScope } from "@/features/settings/mcp/scope";
import { McpEditor } from "@/features/settings/mcp/mcp-editor";

export const Route = createFileRoute("/settings/mcp/$scope/new")({
	component: function NewMcpServerPage() {
		const { scope } = Route.useParams();
		return <McpEditor scope={asScope(scope)} />;
	},
});
