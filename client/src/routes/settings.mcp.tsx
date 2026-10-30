import { createFileRoute } from "@tanstack/react-router";

import { McpLayout } from "@/features/settings/mcp/mcp-panel";

export const Route = createFileRoute("/settings/mcp")({ component: McpLayout });
