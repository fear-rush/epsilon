/**
 * What the panel can claim about a running server. pi reports no connection state,
 * only the tools a server registered and which servers an extension registered, so
 * these checks are the whole truth the dashboard has.
 */
import { describe, expect, test } from "bun:test";

import { aggregateMcpLive, mcpLiveOf } from "./live";

const tool = (namespace: string, name: string, annotations?: Record<string, boolean>) => ({
	namespace,
	name,
	annotations,
});

/** What every listed server carries, so each expectation states only what it checks. */
const quiet = { registered: false, annotations: {} };

describe("one live engine", () => {
	test("tools are listed per server under the configured name, without the registered prefix", () => {
		const live = mcpLiveOf({
			names: ["my-server"],
			tools: [
				tool("mcp__my_server", "mcp__my_server__search"),
				tool("mcp__my_server", "mcp__my_server__get_page"),
				tool("mcp__other", "mcp__other__ping"),
			],
			active: ["codemode"],
		});
		expect(live).toEqual({
			sessions: 1,
			servers: [
				{ name: "my-server", tools: 2, toolNames: ["get_page", "search"], ...quiet },
				{ name: "other", tools: 1, toolNames: ["ping"], ...quiet },
			],
			codemode: true,
			toolSearch: false,
		});
	});

	test("a name that does not carry the namespace is kept as registered", () => {
		const live = mcpLiveOf({
			names: ["files"],
			tools: [tool("mcp__files", "read_mcp_resource")],
			active: [],
		});
		expect(live.servers).toEqual([
			{ name: "files", tools: 1, toolNames: ["read_mcp_resource"], ...quiet },
		]);
	});

	test("a server an extension registered is listed even with no tools", () => {
		const live = mcpLiveOf({ names: [], tools: [], active: [], registered: ["ghost"] });

		expect(live.servers).toEqual([
			{ name: "ghost", tools: 0, toolNames: [], registered: true, annotations: {} },
		]);
	});

	test("a registered server keeps its tools when the namespace had to be spelled", () => {
		const live = mcpLiveOf({
			names: [],
			tools: [tool("mcp__my_server", "mcp__my_server__ping")],
			active: [],
			registered: ["my-server"],
		});

		expect(live.servers).toEqual([
			{
				name: "my-server",
				tools: 1,
				toolNames: ["ping"],
				registered: true,
				annotations: {},
			},
		]);
	});

	test("a tool's hints travel with the name the panel lists", () => {
		const live = mcpLiveOf({
			names: ["docs"],
			tools: [tool("mcp__docs", "mcp__docs__search", { readOnlyHint: true })],
			active: [],
		});

		expect(live.servers[0]?.annotations).toEqual({ search: { readOnlyHint: true } });
	});

	test("a server with no tool registered is not reported, and nothing active stays false", () => {
		expect(mcpLiveOf({ names: ["files"], tools: [], active: ["read"] })).toEqual({
			sessions: 1,
			servers: [],
			codemode: false,
			toolSearch: false,
		});
	});
});

describe("several live engines", () => {
	test("the union keeps every tool name per server and any active reaching tool", () => {
		const live = aggregateMcpLive([
			mcpLiveOf({
				names: ["files"],
				tools: [tool("mcp__files", "mcp__files__read")],
				active: ["read"],
			}),
			mcpLiveOf({
				names: ["files", "docs"],
				tools: [
					tool("mcp__files", "mcp__files__read"),
					tool("mcp__files", "mcp__files__write"),
					tool("mcp__docs", "mcp__docs__find"),
				],
				active: ["tool_search"],
			}),
		]);
		expect(live).toEqual({
			sessions: 2,
			servers: [
				{ name: "docs", tools: 1, toolNames: ["find"], ...quiet },
				{ name: "files", tools: 2, toolNames: ["read", "write"], ...quiet },
			],
			codemode: false,
			toolSearch: true,
		});
	});

	test("an engine that registered a server keeps that answer beside a connected one", () => {
		const live = aggregateMcpLive([
			mcpLiveOf({ names: [], tools: [], active: [], registered: ["ghost"] }),
			mcpLiveOf({ names: ["docs"], tools: [tool("mcp__docs", "mcp__docs__find")], active: [] }),
		]);

		expect(live.servers.map((server) => [server.name, server.tools, server.registered])).toEqual([
			["docs", 1, false],
			["ghost", 0, true],
		]);
	});

	test("no live engine is zero sessions, not an empty answer", () => {
		expect(aggregateMcpLive([])).toEqual({
			sessions: 0,
			servers: [],
			codemode: false,
			toolSearch: false,
		});
	});
});
