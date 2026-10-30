import { skipToken, useQuery } from "@tanstack/react-query";

import { fetchMcpServer } from "@/lib/api";

/** The editable detail of one MCP server. `undefined` means a new one. */
export const useMcpServer = (name: string | undefined) =>
	useQuery({
		queryKey: ["mcp", name],
		queryFn: name === undefined ? skipToken : () => fetchMcpServer(name),
	});
