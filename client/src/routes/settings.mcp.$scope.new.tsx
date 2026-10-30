import { createFileRoute } from "@tanstack/react-router";
import type { McpScope } from "shared";

import { McpEditor } from "@/components/settings/mcp/mcp-editor";

const asScope = (value: string): McpScope => (value === "project" ? "project" : "global");

export const Route = createFileRoute("/settings/mcp/$scope/new")({
	component: function NewMcpServerPage() {
		const { scope } = Route.useParams();
		return <McpEditor scope={asScope(scope)} />;
	},
});
