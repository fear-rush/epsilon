import { createFileRoute } from "@tanstack/react-router";

import { MasterDetailPlaceholder } from "@/features/settings/kit/master-detail-layout";

export const Route = createFileRoute("/settings/mcp/")({
	component: () => (
		<MasterDetailPlaceholder>
			Select an MCP server on the left, or add one below the list.
		</MasterDetailPlaceholder>
	),
});
