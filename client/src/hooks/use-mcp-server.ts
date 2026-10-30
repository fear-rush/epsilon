import { skipToken, useQuery } from "@tanstack/react-query";
import type { McpScope } from "shared";

import { fetchMcpServer } from "@/lib/api";

/** The editable detail of one MCP server. `undefined` means a new one. */
export const useMcpServer = (scope: McpScope, name: string | undefined) =>
	useQuery({
		queryKey: ["mcp", scope, name],
		queryFn: name === undefined ? skipToken : () => fetchMcpServer(scope, name),
	});
