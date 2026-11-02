/**
 * What the panel can say about servers that are actually connected. pi exposes no
 * connection state through the SDK: a server's tools appear once it connects, and
 * `getAllTools()` reports each with the namespace `mcp__<server>`. That is the
 * only honest signal, so this file turns it into counts and tool names and says nothing about
 * failed, needs-sign-in or still-connecting.
 */
import { mcpNamespaceOf } from "shared";

import type { McpLive, McpToolAnnotations } from "./contract";

/** One live engine's view of a server: its tools, their hints, and whether an extension registered it. */
type ServerEntry = {
	toolNames: string[];
	annotations: Record<string, McpToolAnnotations>;
	registered: boolean;
};

const entryOf = (): ServerEntry => ({ toolNames: [], annotations: {}, registered: false });

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
 * with its `mcp__<server>` namespace, the name it was registered under and the
 * hints the server sent; `active` are the reaching tools the model can call right
 * now. A server an extension registered is listed even with no tools, which is the
 * one thing its tools cannot tell the panel.
 */
export function mcpLiveOf(input: {
	/** The configured names, so a server is reported by the name the panel lists. */
	names: readonly string[];
	/** One entry per tool the server registered. */
	tools: Iterable<{ namespace: string; name: string; annotations?: McpToolAnnotations }>;
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
		const name = toolNameOf(tool.namespace, tool.name);
		entry.toolNames.push(name);
		if (tool.annotations !== undefined) entry.annotations[name] = tool.annotations;
		servers.set(server, entry);
	}
	return {
		sessions: 1,
		servers: [...servers].map(([name, entry]) => ({
			name,
			tools: entry.toolNames.length,
			toolNames: entry.toolNames.toSorted(),
			registered: entry.registered,
			annotations: entry.annotations,
		})),
		codemode: input.active.includes("codemode"),
		toolSearch: input.active.includes("tool_search"),
	};
}

/** The union over the live engines; a server counts as connected if any engine holds its tools. */
export function aggregateMcpLive(states: readonly McpLive[]): McpLive {
	const servers = new Map<string, ServerEntry>();
	for (const state of states) {
		for (const server of state.servers) {
			const entry = servers.get(server.name) ?? entryOf();
			entry.toolNames = [...new Set([...entry.toolNames, ...server.toolNames])];
			entry.annotations = { ...entry.annotations, ...server.annotations };
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
				tools: entry.toolNames.length,
				toolNames: entry.toolNames.toSorted(),
				registered: entry.registered,
				annotations: entry.annotations,
			}))
			.sort((left, right) => left.name.localeCompare(right.name)),
		codemode: states.some((state) => state.codemode),
		toolSearch: states.some((state) => state.toolSearch),
	};
}
