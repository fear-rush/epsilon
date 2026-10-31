/**
 * What the panel can claim about a running server. pi reports no connection
 * state, only the tools a server registered, so these checks are the whole truth
 * the dashboard has.
 */
import { describe, expect, test } from "bun:test";

import { aggregateMcpLive, mcpLiveOf } from "./live";

const tool = (namespace: string, name: string) => ({ namespace, name });

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
				{ name: "my-server", tools: 2, toolNames: ["get_page", "search"] },
				{ name: "other", tools: 1, toolNames: ["ping"] },
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
		expect(live.servers).toEqual([{ name: "files", tools: 1, toolNames: ["read_mcp_resource"] }]);
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
				{ name: "docs", tools: 1, toolNames: ["find"] },
				{ name: "files", tools: 2, toolNames: ["read", "write"] },
			],
			codemode: false,
			toolSearch: true,
		});
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
