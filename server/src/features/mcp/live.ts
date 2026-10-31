/**
 * What the panel can say about servers that are actually connected. pi exposes no
 * connection state through the SDK: a server's tools appear once it connects, and
 * `getAllTools()` reports each with the namespace `mcp__<server>`. That is the
 * only honest signal, so this file turns it into counts and tool names and says nothing about
 * failed, needs-sign-in or still-connecting.
 */
import { mcpNamespaceOf } from "shared";

import type { McpLive } from "./contract";

/**
 * The name a server offers a tool under, recovered from the name pi registered it
 * as: `mcp__<server>__<tool>`. pi sanitizes the tool part (anything but letters,
 * digits and `_` becomes `_`, and a long name gets a hash suffix) and does not
 * expose the original, so a tool whose own name had such characters is listed
 * under its registered spelling.
 */
const toolNameOf = (namespace: string, registered: string): string =>
	registered.startsWith(`${namespace}__`) ? registered.slice(namespace.length + 2) : registered;

/**
 * One live engine's answer. `tools` carries one entry per registered MCP tool,
 * with its `mcp__<server>` namespace and the name it was registered under;
 * `active` are the reaching tools the model can call right now.
 */
export function mcpLiveOf(input: {
	/** The configured names, so a server is reported by the name the panel lists. */
	names: readonly string[];
	/** One entry per tool the server registered. */
	tools: Iterable<{ namespace: string; name: string }>;
	active: readonly string[];
}): McpLive {
	const configured = new Map(input.names.map((name) => [mcpNamespaceOf(name), name]));
	const names = new Map<string, string[]>();
	for (const tool of input.tools) {
		const server = configured.get(tool.namespace) ?? tool.namespace.replace(/^mcp__/, "");
		names.set(server, [...(names.get(server) ?? []), toolNameOf(tool.namespace, tool.name)]);
	}
	return {
		sessions: 1,
		servers: [...names].map(([name, toolNames]) => ({
			name,
			tools: toolNames.length,
			toolNames: toolNames.toSorted(),
		})),
		codemode: input.active.includes("codemode"),
		toolSearch: input.active.includes("tool_search"),
	};
}

/** The union over the live engines; a server counts as connected if any engine holds its tools. */
export function aggregateMcpLive(states: readonly McpLive[]): McpLive {
	const tools = new Map<string, Set<string>>();
	for (const state of states) {
		for (const server of state.servers) {
			const known = tools.get(server.name) ?? new Set<string>();
			for (const name of server.toolNames) known.add(name);
			tools.set(server.name, known);
		}
	}
	return {
		// Summed rather than counted: a session can dispose between the registry's
		// filter and this call, and it then answers with no session of its own.
		sessions: states.reduce((total, state) => total + state.sessions, 0),
		servers: [...tools]
			.map(([name, known]) => ({ name, tools: known.size, toolNames: [...known].toSorted() }))
			.sort((left, right) => left.name.localeCompare(right.name)),
		codemode: states.some((state) => state.codemode),
		toolSearch: states.some((state) => state.toolSearch),
	};
}
