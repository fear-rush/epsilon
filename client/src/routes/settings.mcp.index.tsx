import { createFileRoute } from "@tanstack/react-router";
import { ServerIcon } from "lucide-react";

import { DetailPlaceholder } from "@/components/patterns/pane/detail-placeholder";

export const Route = createFileRoute("/settings/mcp/")({
	component: () => <DetailPlaceholder icon={ServerIcon} title="Select an MCP server" />,
});
