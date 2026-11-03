import { Effect } from "effect";

import { McpRpcs } from "#protocol/config/mcp";

import { McpService } from "./service.ts";

/**
 * Settings → MCP over the socket. The service owns the files and pi's rules; the group
 * owns the schemas and the tagged refusal.
 */
export const McpHandlersLive = McpRpcs.toLayer(
	Effect.gen(function* () {
		const mcp = yield* McpService;
		return {
			"config.mcp.list": ({ folder }) => mcp.list(folder),
			"config.mcp.live": ({ folder }) => mcp.live(folder),
			"config.mcp.read": ({ folder, scope, name }) => mcp.read(folder, scope, name),
			"config.mcp.save": ({ folder, server }) => mcp.save(folder, server),
			"config.mcp.remove": ({ folder, scope, name }) => mcp.remove(folder, scope, name),
			"config.mcp.setEnabled": ({ folder, scope, name, enabled }) =>
				mcp.setEnabled(folder, scope, name, enabled),
			"config.mcp.setInProject": ({ folder, name, value }) => mcp.setInProject(folder, name, value),
			"config.mcp.setAutoEnableCodemode": ({ folder, scope, enabled }) =>
				mcp.setAutoEnableCodemode(folder, scope, enabled),
			"config.mcp.readRaw": ({ folder, scope, name }) =>
				mcp.readRaw(folder, scope, name).pipe(Effect.map((text) => ({ text }))),
			"config.mcp.writeRaw": ({ folder, scope, name, text }) =>
				mcp.writeRaw(folder, scope, name, text),
		};
	}),
);
