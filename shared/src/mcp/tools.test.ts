import { describe, expect, test } from "bun:test";

import { effectiveToolExposure, toolPatternMatches, withToolReachable } from "./tools";
import type { ToolRule } from "./tools";

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
