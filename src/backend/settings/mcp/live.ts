import { Effect, Option, Schema } from "effect";

import type {
	McpAttention,
	McpEngineLive,
	McpLive,
	McpLiveServer,
	McpLiveTool,
} from "#protocol/settings/mcp";
import { McpEngineLive as McpEngineLiveSchema } from "#protocol/settings/mcp";

import { mcpNamespaceOf } from "../../../domain/mcp/rules.ts";
import { mcpToolAddress } from "../../../domain/mcp/tools.ts";
import { withDefined } from "../../../domain/object.ts";
import type { LogApi } from "../../platform/log.ts";

/**
 * What the panel can say about servers that are actually connected.
 *
 * pi exposes no connection state: a server's tools appear once it connects, and
 * `getAllTools()` reports each with the namespace `mcp__<server>` and the exposure pi
 * resolved. That is the only honest signal, so this turns it into rows and says nothing
 * about failed, needs-sign-in or still-connecting.
 */

type ServerEntry = {
	readonly tools: McpLiveTool[];
	readonly attention: McpAttention | undefined;
	readonly registered: boolean;
};

const entryOf = (): ServerEntry => ({ attention: undefined, registered: false, tools: [] });

const rowOf = (name: string, entry: ServerEntry): McpLiveServer =>
	withDefined(
		{
			name,
			tools: dedupeTools(entry.tools),
			registered: entry.registered,
		} satisfies McpLiveServer,
		"attention",
		entry.attention,
	);

/** One live engine's answer, with the configured names so a server keeps the panel's spelling. */
export function mcpLiveOf(input: {
	readonly names: ReadonlyArray<string>;
	readonly engine: McpEngineLive;
}): McpLive {
	const configured = new Map(input.names.map((name) => [mcpNamespaceOf(name), name]));
	const byNamespace = new Map(input.engine.registered.map((name) => [mcpNamespaceOf(name), name]));
	const servers = new Map<string, ServerEntry>();
	for (const name of byNamespace.values()) {
		servers.set(name, { attention: undefined, registered: true, tools: [] });
	}
	for (const report of input.engine.attention) {
		const entry = servers.get(report.name) ?? entryOf();
		servers.set(report.name, { ...entry, attention: report.attention });
	}
	for (const tool of input.engine.tools) {
		const server =
			configured.get(tool.namespace) ??
			byNamespace.get(tool.namespace) ??
			tool.namespace.replace(/^mcp__/, "");
		const entry = servers.get(server) ?? entryOf();
		const address = mcpToolAddress(server, tool.name);
		entry.tools.push(
			withDefined(
				{
					exact: address.exact,
					exposure: tool.exposure,
					key: address.key,
					name: address.name,
				} satisfies McpLiveTool,
				"annotations",
				tool.annotations,
			),
		);
		servers.set(server, entry);
	}
	return {
		sessions: 1,
		servers: [...servers].map(([name, entry]) => rowOf(name, entry)),
		resourceTools: input.engine.resourceTools.toSorted(),
		codemode: input.engine.active.includes("codemode"),
		toolSearch: input.engine.active.includes("tool_search"),
	};
}

/**
 * The union over the live engines; a server counts as connected if any engine holds its
 * tools. A tool or a report two engines carry keeps the first answer, since the panel
 * shows one row per server and the engines run the same files.
 */
export function aggregateMcpLive(states: ReadonlyArray<McpLive>): McpLive {
	const servers = new Map<string, ServerEntry>();
	for (const state of states) {
		for (const server of state.servers) {
			const entry = servers.get(server.name) ?? entryOf();
			const seen = new Set(entry.tools.map((tool) => tool.name));
			entry.tools.push(...server.tools.filter((tool) => !seen.has(tool.name)));
			servers.set(server.name, {
				attention: entry.attention ?? server.attention,
				registered: entry.registered || server.registered,
				tools: entry.tools,
			});
		}
	}
	return {
		// Summed rather than counted: a session can dispose between the registry's filter
		// and this call, and it then answers with no session of its own.
		sessions: states.reduce((total, state) => total + state.sessions, 0),
		servers: [...servers]
			.map(([name, entry]) => rowOf(name, entry))
			.toSorted((left, right) => left.name.localeCompare(right.name)),
		resourceTools: [...new Set(states.flatMap((state) => state.resourceTools))].toSorted(),
		codemode: states.some((state) => state.codemode),
		toolSearch: states.some((state) => state.toolSearch),
	};
}

const dedupeTools = (tools: ReadonlyArray<McpLiveTool>): ReadonlyArray<McpLiveTool> => {
	const seen = new Map<string, McpLiveTool>();
	for (const tool of tools) if (!seen.has(tool.name)) seen.set(tool.name, tool);
	return [...seen.values()].toSorted((left, right) => left.name.localeCompare(right.name));
};

/**
 * Queries every live engine and aggregates their answers. An answer this version cannot
 * decode is a log line, not a failed page: the engine is a child process pinned to this
 * build, so that is a defect, and the rest of the panel still works.
 */
export const mcpLiveReader = (deps: {
	readonly queryAll: Effect.Effect<ReadonlyArray<{ readonly result: unknown }>>;
	readonly log: LogApi;
}) => {
	return Effect.fn("Mcp.liveEngines")(function* (names: ReadonlyArray<string>) {
		const answers = yield* deps.queryAll;
		const states: McpLive[] = [];
		for (const answer of answers) {
			const decoded = Schema.decodeUnknownOption(McpEngineLiveSchema)(answer.result);
			if (Option.isNone(decoded)) {
				yield* deps.log.write("warn", "an engine's MCP answer could not be decoded");
				continue;
			}
			states.push(mcpLiveOf({ engine: decoded.value, names }));
		}
		return aggregateMcpLive(states);
	});
};
