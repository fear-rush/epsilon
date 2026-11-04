import { describe, expect, test } from "bun:test";

import { decodeServerFrame } from "#protocol/conversation/frames";
import type { ServerFrame } from "#protocol/conversation/frames";

import { bashTurnFrames } from "../../../test/fixtures/conversation/bash-turn.ts";
import { reduce } from "./reduce.ts";
import {
	entryById,
	isWritable,
	lastAssistantText,
	toolRunOf,
	toolRunsFor,
	transcript,
	treeChildren,
} from "./selectors.ts";
import { emptyConversation } from "./state.ts";

const frames = (values: ReadonlyArray<ServerFrame>): ReadonlyArray<ServerFrame> =>
	values.map((value) => decodeServerFrame(value));

const state = frames(bashTurnFrames).reduce(reduce, emptyConversation);

describe("selectors", () => {
	test("transcript follows arrival order and puts streaming last", () => {
		const streaming = reduce(state, {
			t: "streaming",
			streamId: "next",
			blockIndex: 0,
			kind: "text",
			delta: "hi",
		});
		const rows = transcript(streaming);
		expect(rows.map((row) => row.id)).toEqual(["u1", "a1", "t1", "a2", "next"]);
		expect(rows.at(-1)?.kind).toBe("streaming");
	});

	test("tool runs are found by the entry that called them and by their call id", () => {
		expect(toolRunsFor(state, "a1").map((tool) => tool.toolCallId)).toEqual(["call-1"]);
		expect(toolRunsFor(state, "a2")).toHaveLength(0);
		expect(toolRunOf(state, "call-1")?.status).toBe("ok");
	});

	test("entries are found by id", () => {
		expect(entryById(state, "t1")?.role).toBe("toolResult");
		expect(entryById(state, "missing")).toBeUndefined();
	});

	test("last assistant text ignores thinking and tool calls", () => {
		expect(lastAssistantText(state)).toBe("Two files.");
	});

	test("a chat is writable until it drifts", () => {
		expect(isWritable(state)).toBe(true);
		expect(isWritable(reduce(state, { t: "drift", reason: "changed elsewhere" }))).toBe(false);
	});

	test("tree children are built in one pass, iteratively", () => {
		const withTree = reduce(state, {
			t: "tree",
			entries: [
				{ id: "u1", parentId: null, kind: "user", label: "run the tests", ts: 1_000, onPath: true },
			],
		});
		const children = treeChildren(withTree);
		expect(children.get("")).toEqual(["u1"]);
		expect(children.get("u1")).toBeUndefined();
	});
});
