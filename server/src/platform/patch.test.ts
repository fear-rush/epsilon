import { describe, expect, test } from "bun:test";

import { mergeSecrets, setDefined, setOrDelete } from "./patch";

type Target = {
	a?: number;
	text?: string;
	list?: string[];
	map?: Record<string, string>;
	flag?: boolean;
	count?: number;
	keep?: { unknown: boolean };
};

describe("setOrDelete", () => {
	test("unsets undefined, an empty string, an empty list and an empty object", () => {
		const target: Target = { a: 1, text: "x", list: ["x"], map: { k: "v" } };
		setOrDelete(target, "a", undefined);
		setOrDelete(target, "text", "");
		setOrDelete(target, "list", []);
		setOrDelete(target, "map", {});
		expect(target).toEqual({});
	});

	test("writes false, zero and non-empty values", () => {
		const target: Target = {};
		setOrDelete(target, "flag", false);
		setOrDelete(target, "count", 0);
		setOrDelete(target, "list", ["x"]);
		setOrDelete(target, "map", { k: "v" });
		expect(target).toEqual({ flag: false, count: 0, list: ["x"], map: { k: "v" } });
	});

	test("leaves other keys alone", () => {
		const target: Target = { keep: { unknown: true }, text: "old" };
		setOrDelete(target, "text", "");
		expect(target).toEqual({ keep: { unknown: true } });
	});
});

describe("setDefined", () => {
	test("only undefined unsets; an empty list or string is a value", () => {
		const target: Target = { a: 1 };
		setDefined(target, "list", []);
		setDefined(target, "text", "");
		setDefined(target, "a", undefined);
		expect(target).toEqual({ list: [], text: "" });
	});
});

describe("mergeSecrets", () => {
	test("a blank value keeps the stored one; names left out are removed", () => {
		const merged = mergeSecrets(
			{ A: "", B: "new" },
			{ A: "stored", C: "gone" },
			{ onMissingStored: "throw" },
		);
		expect(merged).toEqual({ A: "stored", B: "new" });
	});

	test("a blank value with nothing stored throws or drops, as asked", () => {
		expect(() => mergeSecrets({ A: "" }, {}, { onMissingStored: "throw" })).toThrow(
			'Add a value for "A", or remove the row.',
		);
		expect(mergeSecrets({ A: "", B: "x" }, {}, { onMissingStored: "drop" })).toEqual({ B: "x" });
	});

	test("nothing left is undefined, so the caller deletes the key", () => {
		expect(mergeSecrets(undefined, { A: "s" }, { onMissingStored: "throw" })).toBeUndefined();
		expect(mergeSecrets({}, { A: "s" }, { onMissingStored: "throw" })).toBeUndefined();
		expect(mergeSecrets({ A: "" }, {}, { onMissingStored: "drop" })).toBeUndefined();
	});
});
