import { createFileRoute } from "@tanstack/react-router";

import { McpLayout } from "@/features/settings/mcp/mcp-layout";

export const Route = createFileRoute("/settings/mcp")({ component: McpLayout });
