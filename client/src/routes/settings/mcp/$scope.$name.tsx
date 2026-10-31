import { createFileRoute } from "@tanstack/react-router";

import { asScope } from "@/features/settings/mcp/mcp-detail";
import { McpEditor } from "@/features/settings/mcp/mcp-form";
import { mcpQuery, settingsQuery } from "@/features/settings/queries";

export const Route = createFileRoute("/settings/mcp/$scope/$name")({
	loaderDeps: ({ search }) => ({ project: search.project }),
	// Warm the page's reads before it mounts; the pane reports a failure in its own words.
	loader: async ({ context, params, deps }) => {
		await Promise.all([
			context.queryClient.query({ ...settingsQuery(deps.project), staleTime: "static" }),
			context.queryClient.query({
				...mcpQuery(deps.project, asScope(params.scope), params.name),
				staleTime: "static",
			}),
		]).catch(() => undefined);
	},
	component: function McpServerPage() {
		const { scope, name } = Route.useParams();
		return <McpEditor scope={asScope(scope)} name={name} />;
	},
	head: ({ params }) => ({
		meta: [{ title: `${params.name} · MCP servers · Settings` }],
	}),
});
