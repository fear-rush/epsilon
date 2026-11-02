/**
 * What the panel can claim about a running server. pi reports no connection state,
 * only the tools a server registered and which servers an extension registered, so
 * these checks are the whole truth the dashboard has. Each tool also carries the
 * rule the panel writes for it: the server's own name when pi's registered name
 * can say it, and a pattern when it cannot.
 */
import { describe, expect, test } from "bun:test";
import type { McpExposure } from "shared";

import { aggregateMcpLive, mcpLiveOf } from "./live";

const tool = (
	namespace: string,
	name: string,
	extra: { exposure?: McpExposure; annotations?: { readOnlyHint?: boolean } } = {},
) => ({ namespace, name, exposure: extra.exposure ?? "direct", ...extra });

/** A row whose registered name is the server's own, so the rule is that name. */
const row = (name: string) => ({ name, key: name, exact: true, exposure: "direct" as const });

/** What every listed server carries, so each expectation states only what it checks. */
const quiet = { registered: false };

/** What every live answer carries when nothing registered resource tools. */
const noResources = { resourceTools: [] };

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
			...noResources,
			servers: [
				{
					name: "my-server",
					tools: [
						{ name: "get_page", key: "get*page", exact: false, exposure: "direct" },
						row("search"),
					],
					...quiet,
				},
				{ name: "other", tools: [row("ping")], ...quiet },
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
			{
				name: "files",
				tools: [
					{ name: "read_mcp_resource", key: "read*mcp*resource", exact: false, exposure: "direct" },
				],
				...quiet,
			},
		]);
	});

	test("a server an extension registered is listed even with no tools", () => {
		const live = mcpLiveOf({ names: [], tools: [], active: [], registered: ["ghost"] });

		expect(live.servers).toEqual([{ name: "ghost", tools: [], registered: true }]);
	});

	test("a registered server keeps its tools when the namespace had to be spelled", () => {
		const live = mcpLiveOf({
			names: [],
			tools: [tool("mcp__my_server", "mcp__my_server__ping")],
			active: [],
			registered: ["my-server"],
		});

		expect(live.servers).toEqual([{ name: "my-server", tools: [row("ping")], registered: true }]);
	});

	test("a name pi rewrote is written as a pattern, so the rule still reaches the tool", () => {
		const live = mcpLiveOf({
			names: ["github"],
			tools: [tool("mcp__github", "mcp__github__get_issue")],
			active: [],
		});

		expect(live.servers[0]?.tools).toEqual([
			{ name: "get_issue", key: "get*issue", exact: false, exposure: "direct" },
		]);
	});

	test("a name pi shortened is matched by its head, since the end is gone", () => {
		const own = "list_every_repository_the_operator_can_see_and_search";
		const registered = `mcp__github__${own}`;
		// pi keeps the first 55 characters of a name past 64 and ends it with a hash.
		const shortened = `${registered.slice(0, 55)}_0123abcd`;
		const head = registered.slice(0, 55).slice("mcp__github__".length);
		const live = mcpLiveOf({
			names: ["github"],
			tools: [tool("mcp__github", shortened)],
			active: [],
		});

		expect(live.servers[0]?.tools).toEqual([
			{
				name: shortened.slice("mcp__github__".length),
				key: `${head.split("_").join("*")}*`,
				exact: false,
				exposure: "direct",
			},
		]);
	});

	test("pi's own exposure for a tool travels with it", () => {
		const live = mcpLiveOf({
			names: ["docs"],
			tools: [
				tool("mcp__docs", "mcp__docs__search", {
					exposure: "hidden",
					annotations: { readOnlyHint: true },
				}),
			],
			active: [],
		});

		expect(live.servers[0]?.tools).toEqual([
			{ ...row("search"), exposure: "hidden", annotations: { readOnlyHint: true } },
		]);
	});

	test("what pi said about a server travels with it even when it holds no tool", () => {
		const live = mcpLiveOf({
			names: ["docs"],
			tools: [],
			active: [],
			attention: new Map([["docs", { kind: "needs-sign-in" } as const]]),
		});

		expect(live.servers).toEqual([
			{ name: "docs", tools: [], registered: false, attention: { kind: "needs-sign-in" } },
		]);
	});

	test("the resource tools pi registered for the session are named, sorted once", () => {
		const live = mcpLiveOf({
			names: [],
			tools: [],
			active: [],
			resourceTools: ["read_mcp_resource", "list_mcp_resources"],
		});

		expect(live.resourceTools).toEqual(["list_mcp_resources", "read_mcp_resource"]);
	});

	test("a server with no tool registered is not reported, and nothing active stays false", () => {
		expect(mcpLiveOf({ names: ["files"], tools: [], active: ["read"] })).toEqual({
			sessions: 1,
			servers: [],
			...noResources,
			codemode: false,
			toolSearch: false,
		});
	});
});

describe("several live engines", () => {
	test("the union keeps every tool per server and any active reaching tool", () => {
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
			...noResources,
			servers: [
				{ name: "docs", tools: [row("find")], ...quiet },
				{ name: "files", tools: [row("read"), row("write")], ...quiet },
			],
			codemode: false,
			toolSearch: true,
		});
	});

	test("a tool two engines report keeps one row", () => {
		const live = aggregateMcpLive([
			mcpLiveOf({
				names: ["files"],
				tools: [tool("mcp__files", "mcp__files__read", { exposure: "hidden" })],
				active: [],
			}),
			mcpLiveOf({
				names: ["files"],
				tools: [tool("mcp__files", "mcp__files__read")],
				active: [],
			}),
		]);

		expect(live.servers).toEqual([
			{ name: "files", tools: [{ ...row("read"), exposure: "hidden" }], ...quiet },
		]);
	});

	test("a server two engines report keeps the first reason pi gave", () => {
		const live = aggregateMcpLive([
			mcpLiveOf({
				names: ["docs"],
				tools: [],
				active: [],
				attention: new Map([["docs", { kind: "failed", message: "boom" } as const]]),
			}),
			mcpLiveOf({
				names: ["docs"],
				tools: [tool("mcp__docs", "mcp__docs__find")],
				active: [],
			}),
		]);

		expect(live.servers).toEqual([
			{
				name: "docs",
				tools: [row("find")],
				registered: false,
				attention: { kind: "failed", message: "boom" },
			},
		]);
	});

	test("an engine that registered a server keeps that answer beside a connected one", () => {
		const live = aggregateMcpLive([
			mcpLiveOf({ names: [], tools: [], active: [], registered: ["ghost"] }),
			mcpLiveOf({ names: ["docs"], tools: [tool("mcp__docs", "mcp__docs__find")], active: [] }),
		]);

		expect(
			live.servers.map((server) => [server.name, server.tools.length, server.registered]),
		).toEqual([
			["docs", 1, false],
			["ghost", 0, true],
		]);
	});

	test("resource tools are the union over the engines, named once", () => {
		const live = aggregateMcpLive([
			mcpLiveOf({ names: [], tools: [], active: [], resourceTools: ["list_mcp_resources"] }),
			mcpLiveOf({
				names: [],
				tools: [],
				active: [],
				resourceTools: ["list_mcp_resources", "read_mcp_resource"],
			}),
		]);

		expect(live.resourceTools).toEqual(["list_mcp_resources", "read_mcp_resource"]);
	});

	test("no live engine is zero sessions, not an empty answer", () => {
		expect(aggregateMcpLive([])).toEqual({
			sessions: 0,
			servers: [],
			...noResources,
			codemode: false,
			toolSearch: false,
		});
	});
});
