/**
 * What the panel can claim about a running server. pi reports no connection
 * state, only the tools a server registered, so these checks are the whole truth
 * the dashboard has.
 */
import { describe, expect, test } from "bun:test";

import { aggregateMcpLive, mcpLiveOf } from "./live";

describe("one live engine", () => {
	test("tools are counted per server under the configured name", () => {
		const live = mcpLiveOf({
			names: ["my-server"],
			namespaces: ["mcp__my_server", "mcp__my_server", "mcp__other"],
			active: ["codemode"],
		});
		expect(live).toEqual({
			sessions: 1,
			servers: [
				{ name: "my-server", tools: 2 },
				{ name: "other", tools: 1 },
			],
			codemode: true,
			toolSearch: false,
		});
	});

	test("a server with no tool registered is not reported, and nothing active stays false", () => {
		expect(mcpLiveOf({ names: ["files"], namespaces: [], active: ["read"] })).toEqual({
			sessions: 1,
			servers: [],
			codemode: false,
			toolSearch: false,
		});
	});
});

describe("several live engines", () => {
	test("the union keeps the largest count per server and any active reaching tool", () => {
		const live = aggregateMcpLive([
			mcpLiveOf({ names: ["files"], namespaces: ["mcp__files"], active: ["read"] }),
			mcpLiveOf({
				names: ["files", "docs"],
				namespaces: ["mcp__files", "mcp__files", "mcp__docs"],
				active: ["tool_search"],
			}),
		]);
		expect(live).toEqual({
			sessions: 2,
			servers: [
				{ name: "docs", tools: 1 },
				{ name: "files", tools: 2 },
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
