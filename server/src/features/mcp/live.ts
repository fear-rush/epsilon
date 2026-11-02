/**
 * What the panel can say about servers that are actually connected. pi exposes no
 * connection state through the SDK: a server's tools appear once it connects, and
 * `getAllTools()` reports each with the namespace `mcp__<server>` and the exposure
 * pi resolved for it. That is the only honest signal, so this file turns it into
 * rows and says nothing about failed, needs-sign-in or still-connecting.
 */
import { type McpExposure, mcpNamespaceOf, mcpToolAddress } from "shared";

import type { McpLive, McpLiveTool, McpToolAnnotations } from "./contract";

/** One live engine's view of a server: its tools, and whether an extension registered it. */
type ServerEntry = {
	tools: McpLiveTool[];
	registered: boolean;
};

const entryOf = (): ServerEntry => ({ tools: [], registered: false });

/**
 * One live engine's answer. `tools` carries one entry per registered MCP tool:
 * the name the transcript shows, the rule that reaches it, and the exposure pi
 * resolved for it in that engine. A server an extension registered is listed even
 * with no tools, which is the one thing its tools cannot tell the panel.
 */
export function mcpLiveOf(input: {
	/** The configured names, so a server is reported by the name the panel lists. */
	names: readonly string[];
	/** One entry per tool the server registered. */
	tools: Iterable<{
		namespace: string;
		name: string;
		exposure: McpExposure;
		annotations?: McpToolAnnotations;
	}>;
	active: readonly string[];
	/** Servers extensions registered, connected or not. */
	registered?: readonly string[];
}): McpLive {
	const configured = new Map(input.names.map((name) => [mcpNamespaceOf(name), name]));
	const byNamespace = new Map((input.registered ?? []).map((name) => [mcpNamespaceOf(name), name]));
	const servers = new Map<string, ServerEntry>();
	for (const name of byNamespace.values()) {
		servers.set(name, { ...entryOf(), registered: true });
	}
	for (const tool of input.tools) {
		const server =
			configured.get(tool.namespace) ??
			byNamespace.get(tool.namespace) ??
			tool.namespace.replace(/^mcp__/, "");
		const entry = servers.get(server) ?? entryOf();
		entry.tools.push({
			...mcpToolAddress(server, tool.name),
			exposure: tool.exposure,
			annotations: tool.annotations,
		});
		servers.set(server, entry);
	}
	return {
		sessions: 1,
		servers: [...servers].map(([name, entry]) => ({
			name,
			tools: entry.tools.toSorted((left, right) => left.name.localeCompare(right.name)),
			registered: entry.registered,
		})),
		codemode: input.active.includes("codemode"),
		toolSearch: input.active.includes("tool_search"),
	};
}

/**
 * The union over the live engines; a server counts as connected if any engine holds
 * its tools. A tool two engines report keeps the first answer, since the panel shows
 * one row per tool and the engines run the same file.
 */
export function aggregateMcpLive(states: readonly McpLive[]): McpLive {
	const servers = new Map<string, ServerEntry>();
	for (const state of states) {
		for (const server of state.servers) {
			const entry = servers.get(server.name) ?? entryOf();
			const seen = new Set(entry.tools.map((tool) => tool.name));
			entry.tools = [...entry.tools, ...server.tools.filter((tool) => !seen.has(tool.name))];
			entry.registered = entry.registered || server.registered;
			servers.set(server.name, entry);
		}
	}
	return {
		// Summed rather than counted: a session can dispose between the registry's
		// filter and this call, and it then answers with no session of its own.
		sessions: states.reduce((total, state) => total + state.sessions, 0),
		servers: [...servers]
			.map(([name, entry]) => ({
				name,
				tools: entry.tools.toSorted((left, right) => left.name.localeCompare(right.name)),
				registered: entry.registered,
			}))
			.sort((left, right) => left.name.localeCompare(right.name)),
		codemode: states.some((state) => state.codemode),
		toolSearch: states.some((state) => state.toolSearch),
	};
}
