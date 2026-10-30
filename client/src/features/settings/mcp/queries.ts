import { skipToken, useQuery } from "@tanstack/react-query";
import type { McpScope } from "shared";

import { settingsKeys } from "@/api/keys";
import { fetchMcpServer } from "@/api/endpoints";

/** The editable detail of one MCP server. `undefined` means a new one. */
export const useMcpServer = (scope: McpScope, name: string | undefined) =>
	useQuery({
		queryKey: settingsKeys.mcp(scope, name),
		queryFn: name === undefined ? skipToken : () => fetchMcpServer(scope, name),
	});
