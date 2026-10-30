/**
 * What the panel can say about servers that are actually connected. pi exposes no
 * connection state through the SDK: a server's tools appear once it connects, and
 * `getAllTools()` reports each with the namespace `mcp__<server>`. That is the
 * only honest signal, so this file turns it into counts and says nothing about
 * failed, needs-sign-in or still-connecting.
 */
import { mcpNamespaceOf } from "shared";

import type { McpLive } from "./contract";

/**
 * One live engine's answer. `namespaces` carries one entry per registered MCP
 * tool, so a namespace seen three times is three tools; `active` are the reaching
 * tools the model can call right now.
 */
export function mcpLiveOf(input: {
	/** The configured names, so a server is reported by the name the panel lists. */
	names: readonly string[];
	/** One entry per tool the server registered, the tool's `mcp__<server>` namespace. */
	namespaces: Iterable<string>;
	active: readonly string[];
}): McpLive {
	const configured = new Map(input.names.map((name) => [mcpNamespaceOf(name), name]));
	const counts = new Map<string, number>();
	for (const namespace of input.namespaces) {
		const name = configured.get(namespace) ?? namespace.replace(/^mcp__/, "");
		counts.set(name, (counts.get(name) ?? 0) + 1);
	}
	return {
		sessions: 1,
		servers: [...counts].map(([name, tools]) => ({ name, tools })),
		codemode: input.active.includes("codemode"),
		toolSearch: input.active.includes("tool_search"),
	};
}

/** The union over the live engines; a server counts as connected if any engine holds its tools. */
export function aggregateMcpLive(states: readonly McpLive[]): McpLive {
	const tools = new Map<string, number>();
	for (const state of states) {
		for (const server of state.servers) {
			tools.set(server.name, Math.max(tools.get(server.name) ?? 0, server.tools));
		}
	}
	return {
		// Summed rather than counted: a session can dispose between the registry's
		// filter and this call, and it then answers with no session of its own.
		sessions: states.reduce((total, state) => total + state.sessions, 0),
		servers: [...tools]
			.map(([name, count]) => ({ name, tools: count }))
			.sort((left, right) => left.name.localeCompare(right.name)),
		codemode: states.some((state) => state.codemode),
		toolSearch: states.some((state) => state.toolSearch),
	};
}
