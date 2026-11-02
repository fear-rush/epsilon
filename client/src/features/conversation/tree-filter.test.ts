import { describe, expect, test } from "bun:test";
import type { SnapshotTreeNode, TreeFilterMode } from "shared";

import { filterTree } from "./tree-filter";

const node = (
	entryId: string,
	kind: SnapshotTreeNode["kind"],
	extra: Partial<SnapshotTreeNode> = {},
): SnapshotTreeNode => ({
	entryId,
	kind,
	text: entryId,
	hasText: true,
	active: false,
	current: false,
	children: [],
	...extra,
});

const ids = (nodes: SnapshotTreeNode[]): string[] =>
	nodes.flatMap((child) => [child.entryId, ...ids(child.children)]);

const tree = [
	node("user", "user"),
	node("assistant", "assistant", {
		children: [
			node("tool", "tool"),
			node("settings", "settings", { children: [node("later", "user")] }),
		],
	}),
	node("labeled", "assistant", { label: "Chosen" }),
	node("empty", "assistant", { hasText: false }),
	node("here", "assistant", { hasText: false, current: true }),
];

const visible = (mode: TreeFilterMode): string[] => ids(filterTree(tree, mode));

describe("pi's tree filters", () => {
	test("default hides bookkeeping and an empty assistant, and promotes the children", () => {
		expect(visible("default")).toEqual(["user", "assistant", "tool", "later", "labeled", "here"]);
	});

	test("no-tools keeps messages and labels but drops tool results and bookkeeping", () => {
		expect(visible("no-tools")).toEqual(["user", "assistant", "later", "labeled", "here"]);
	});

	test("user-only keeps just user entries", () => {
		expect(visible("user-only")).toEqual(["user", "later"]);
	});

	test("labeled-only keeps just labelled entries", () => {
		expect(visible("labeled-only")).toEqual(["labeled"]);
	});

	test("all adds the bookkeeping rows, but still hides an empty assistant that is not here", () => {
		expect(visible("all")).toEqual([
			"user",
			"assistant",
			"tool",
			"settings",
			"later",
			"labeled",
			"here",
		]);
	});
});
