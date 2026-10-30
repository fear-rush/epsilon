/**
 * One MCP server route: read the entry from the file its scope names, then render
 * its form. A new server skips the read and starts from an empty draft.
 */
import type { McpScope } from "shared";

import { DetailLoader } from "@/features/settings/kit/detail-loader";

import { McpForm } from "./mcp-form";
import { useMcpServer } from "./queries";

export function McpEditor({ scope, name }: { scope: McpScope; name?: string }) {
	const query = useMcpServer(scope, name);
	return (
		<DetailLoader
			query={query}
			reading={name !== undefined}
			noun="MCP server"
			backTo="/settings/mcp"
			backLabel="MCP servers"
		>
			{(detail) => <McpForm key={`${scope}\0${detail?.name}`} detail={detail} scope={scope} />}
		</DetailLoader>
	);
}
