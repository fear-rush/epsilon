import { Effect } from "effect";

import { McpRegistryRpcs } from "#protocol/settings/mcp-registry";

import { McpRegistryService } from "./service.ts";

/**
 * Settings → MCP → Registry over the socket. The service owns the HTTP client and the
 * two catalogs; the group owns the shapes and the two tagged failures.
 */
export const McpRegistryHandlersLive = McpRegistryRpcs.toLayer(
	Effect.gen(function* () {
		const registry = yield* McpRegistryService;
		return {
			"settings.mcpRegistry.search": ({ source, q, cursor }) =>
				registry.search({ source, q, cursor }),
			"settings.mcpRegistry.read": ({ source, name }) => registry.read(source, name),
		};
	}),
);
