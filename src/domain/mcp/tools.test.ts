/**
 * pi's tool patterns and the exposure they give a tool: the rules a server's
 * `toolExposure` holds, the switch that writes one, and the key a live tool is reached
 * by. All pure, so the MCP page's switches and the transcript's tool names agree.
 */
import { describe, expect, test } from "bun:test";

import {
	effectiveToolExposure,
	isToolReachable,
	mcpToolAddress,
	toolPatternMatches,
	withToolReachable,
} from "./tools.ts";
import type { ToolRule } from "./tools.ts";

describe("patterns", () => {
	test("* matches any characters and everything else is literal", () => {
		expect(toolPatternMatches("get_*", "get_page")).toBe(true);
		expect(toolPatternMatches("get_*", "forget_page")).toBe(false);
		expect(toolPatternMatches("a.b", "axb")).toBe(false);
		expect(toolPatternMatches("*", "anything")).toBe(true);
	});
});

describe("effective exposure", () => {
	const rules: ToolRule[] = [
		{ pattern: "get_*", exposure: "codemode" },
		{ pattern: "get_secret", exposure: "hidden" },
		{ pattern: "*", exposure: "deferred" },
	];

	test("an exact name wins over a pattern, whatever the order", () => {
		expect(effectiveToolExposure("direct", rules, "get_secret")).toBe("hidden");
	});

	test("among patterns the first match wins", () => {
		expect(effectiveToolExposure("direct", rules, "get_page")).toBe("codemode");
		expect(effectiveToolExposure("direct", rules, "put_page")).toBe("deferred");
	});

	test("with no rule the server's exposure applies, and codemode is the default", () => {
		expect(effectiveToolExposure("direct", [], "x")).toBe("direct");
		expect(effectiveToolExposure(undefined, [], "x")).toBe("codemode");
	});

	test("only a hidden tool is unreachable", () => {
		expect(isToolReachable("direct", [], "x")).toBe(true);
		expect(isToolReachable(undefined, rules, "get_page")).toBe(true);
		expect(isToolReachable("direct", rules, "get_secret")).toBe(false);
	});
});

describe("the tool switch", () => {
	test("off writes an exact hidden rule and keeps the others", () => {
		const rules: ToolRule[] = [{ pattern: "get_*", exposure: "direct" }];
		expect(withToolReachable("codemode", rules, "get_page", false)).toEqual([
			{ pattern: "get_*", exposure: "direct" },
			{ pattern: "get_page", exposure: "hidden" },
		]);
	});

	test("on removes the exact rule when nothing else hides the tool", () => {
		const rules: ToolRule[] = [{ pattern: "get_page", exposure: "hidden" }];
		expect(withToolReachable("codemode", rules, "get_page", true)).toEqual([]);
	});

	test("on writes an exact direct rule when the server is hidden", () => {
		expect(withToolReachable("hidden", [], "get_page", true)).toEqual([
			{ pattern: "get_page", exposure: "direct" },
		]);
	});

	test("on writes an exact direct rule when a pattern hides the tool", () => {
		const rules: ToolRule[] = [{ pattern: "delete_*", exposure: "hidden" }];
		expect(withToolReachable("codemode", rules, "delete_file", true)).toEqual([
			{ pattern: "delete_*", exposure: "hidden" },
			{ pattern: "delete_file", exposure: "direct" },
		]);
	});

	test("switching an already reachable tool on changes nothing", () => {
		expect(withToolReachable("direct", [], "x", true)).toEqual([]);
	});
});

describe("a live tool's address", () => {
	test("a plain name is the server's own, and the key is exact", () => {
		expect(mcpToolAddress("docs", "mcp__docs__getpage")).toEqual({
			exact: true,
			key: "getpage",
			name: "getpage",
		});
	});

	test("an underscore may have been any character pi replaced, so the key is a pattern", () => {
		// pi rewrites every character outside `[A-Za-z0-9_]`, so `get_page` may have been
		// `get-page` or `get.page` on the server: only `*` reaches it again.
		expect(mcpToolAddress("docs", "mcp__docs__get_page")).toEqual({
			exact: false,
			key: "get*page",
			name: "get_page",
		});
	});

	test("a shortened name stops at the hash pi appended", () => {
		// pi's limit is 64 registered characters, with `_` and eight hex appended to a name
		// it had to shorten; the end of the server's own name is not recoverable.
		const body = "a".repeat(44);
		const registered = `mcp__docs__${body}_1a2b3c4d`;
		expect(registered).toHaveLength(64);
		expect(mcpToolAddress("docs", registered)).toEqual({
			exact: false,
			key: `${body}*`,
			name: `${body}_1a2b3c4d`,
		});
	});
});
