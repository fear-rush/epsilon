import { describe, expect, test } from "bun:test";

import { mergeDeep, withoutKey } from "./patch.ts";

describe("mergeDeep", () => {
	test("keeps keys only the base had, including ones a newer pi added", () => {
		const base = { hideThinkingBlock: false, futureKey: "keep me", nested: { a: 1 } };
		const merged = mergeDeep(base, { hideThinkingBlock: true, nested: { b: 2 } });
		expect(merged).toEqual({
			hideThinkingBlock: true,
			futureKey: "keep me",
			nested: { a: 1, b: 2 },
		});
	});

	test("replaces arrays and scalars instead of merging them", () => {
		expect(mergeDeep({ list: [1, 2], value: "old" }, { list: [3], value: "new" })).toEqual({
			list: [3],
			value: "new",
		});
	});

	test("does not mutate its inputs", () => {
		const base = { nested: { a: 1 } };
		mergeDeep(base, { nested: { b: 2 } });
		expect(base).toEqual({ nested: { a: 1 } });
	});

	test("removes a key without touching the rest", () => {
		expect(withoutKey({ keep: 1, drop: 2 }, "drop")).toEqual({ keep: 1 });
	});
});
