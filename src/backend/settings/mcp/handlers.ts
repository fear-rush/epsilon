import { Effect } from "effect";

import { McpRpcs } from "#protocol/settings/mcp";

import { McpService } from "./service.ts";

/**
 * Settings → MCP over the socket. The service owns the files and pi's rules; the group
 * owns the schemas and the tagged refusal.
 */
export const McpHandlersLive = McpRpcs.toLayer(
	Effect.gen(function* () {
		const mcp = yield* McpService;
		return {
			"settings.mcp.list": ({ folder }) => mcp.list(folder),
			"settings.mcp.live": ({ folder }) => mcp.live(folder),
			"settings.mcp.read": ({ folder, scope, name }) => mcp.read(folder, scope, name),
			"settings.mcp.save": ({ folder, server }) => mcp.save(folder, server),
			"settings.mcp.remove": ({ folder, scope, name }) => mcp.remove(folder, scope, name),
			"settings.mcp.setEnabled": ({ folder, scope, name, enabled }) =>
				mcp.setEnabled(folder, scope, name, enabled),
			"settings.mcp.setInProject": ({ folder, name, value }) =>
				mcp.setInProject(folder, name, value),
			"settings.mcp.setDefaultTool": ({ folder, tool, enabled }) =>
				mcp.setDefaultTool(folder, tool, enabled),
			"settings.mcp.setAutoEnableCodemode": ({ folder, scope, enabled }) =>
				mcp.setAutoEnableCodemode(folder, scope, enabled),
			"settings.mcp.readRaw": ({ folder, scope, name }) =>
				mcp.readRaw(folder, scope, name).pipe(Effect.map((text) => ({ text }))),
			"settings.mcp.writeRaw": ({ folder, scope, name, text }) =>
				mcp.writeRaw(folder, scope, name, text),
		};
	}),
);
