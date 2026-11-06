import { describe, expect, test } from "bun:test";

import { findTokenViolations } from "./shared/design-tokens.ts";

const categories = (text: string, allowed?: string[]) =>
	findTokenViolations(text, allowed).map((violation) => violation.category);

describe("design-tokens", () => {
	test("flags bracketed values", () => {
		expect(categories("w-[42rem] h-[calc(100%-1px)] grid-cols-[1fr_2fr] top-[3px]")).toEqual([
			"bracket",
			"bracket",
			"bracket",
			"bracket",
		]);
		expect(categories("leading-[1.2] tracking-[-0.02em] font-[550]")).toHaveLength(3);
	});

	test("allows the documented exception and extra ones", () => {
		expect(categories("grid-cols-[minmax(0,1fr)]")).toEqual([]);
		expect(categories("sm:grid-cols-[minmax(0,1fr)]")).toEqual([]);
		expect(categories("w-[10px]", ["w-[10px]"])).toEqual([]);
		expect(categories("grid-cols-[minmax(0,2fr)]")).toEqual(["bracket"]);
		expect(categories("transition-[height,opacity] transition-[top]")).toEqual([]);
		expect(categories("transition-[width:3px]")).toEqual(["bracket"]);
	});

	test("flags raw palette colours", () => {
		expect(categories("text-red-500 bg-white border-black/50 hover:ring-blue-600")).toEqual([
			"palette",
			"palette",
			"palette",
			"palette",
		]);
		expect(categories("bg-background text-foreground bg-muted")).toEqual([]);
	});

	test("flags type sizes outside the role scale and suggests the role", () => {
		const [xs, sm, xl, big] = findTokenViolations("text-xs text-sm text-xl text-3xl");
		expect(xs?.message).toContain("text-meta");
		expect(sm?.message).toContain("text-body");
		expect(xl?.message).toContain("text-title");
		expect(big?.message).toContain("text-display");
		expect(categories("text-title text-body text-meta text-code text-muted-foreground")).toEqual(
			[],
		);
	});

	test("flags spacing outside the allowed steps", () => {
		expect(categories("p-7 px-9 mt-11 gap-14 gap-x-2.5 space-y-3.5 -ml-7")).toEqual([
			"spacing",
			"spacing",
			"spacing",
			"spacing",
			"spacing",
			"spacing",
			"spacing",
		]);
		expect(findTokenViolations("p-7")[0]?.message).toContain("p-6");
		expect(categories("p-5 mt-10 gap-12")).toEqual([]);
		expect(categories("p-0 p-0.5 gap-1.5 px-pane gap-field -mt-2 mx-auto p-px gap-x-8")).toEqual(
			[],
		);
		expect(categories("size-5 h-10 w-12")).toEqual([]);
	});

	test("passes layout classes that are never linted", () => {
		expect(categories("w-80 max-w-content grid-cols-3 h-full min-h-0 flex-1 top-1/2")).toEqual([]);
		expect(categories("w-[37rem]")).toEqual(["bracket"]);
	});

	test("accepts only the radius roles and names the role for a registry step", () => {
		expect(
			categories("rounded-chip rounded-control rounded-card rounded-bubble rounded-pill"),
		).toEqual([]);
		expect(categories("rounded-none rounded-t-card sm:rounded-b-control")).toEqual([]);
		expect(categories("rounded-md rounded-lg rounded-xl rounded-full rounded rounded-sm")).toEqual(
			Array.from({ length: 6 }, () => "radius"),
		);
		const [md, lg, xl, full, bare, sm] = findTokenViolations(
			"rounded-md rounded-lg rounded-xl rounded-full rounded rounded-sm",
		);
		expect(md?.message).toContain("rounded-chip");
		expect(lg?.message).toContain("rounded-control");
		expect(xl?.message).toContain("rounded-card");
		expect(full?.message).toContain("rounded-pill");
		expect(bare?.message).toContain("choose chip");
		expect(sm?.message).toContain("DESIGN.md → Shapes");
	});

	test("strips variant prefixes, including bracketed ones", () => {
		expect(categories("data-[state=open]:bg-muted has-[>svg]:gap-2")).toEqual([]);
		expect(categories("group-data-[x=y]/name:p-4 dark:bg-card !p-4 sm:-mt-4")).toEqual([]);
		expect(categories("sm:p-7 hover:text-red-500 dark:!text-sm")).toEqual([
			"spacing",
			"palette",
			"textSize",
		]);
		expect(categories("data-[a=b:c]:w-[3px]")).toEqual(["bracket"]);
		expect(categories("[&>svg]:size-4")).toEqual([]);
	});
});
