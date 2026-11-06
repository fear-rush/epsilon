import { describe, expect, test } from "bun:test";

import { reduce } from "#domain/conversation/reduce";
import { transcript } from "#domain/conversation/selectors";
import { emptyConversation } from "#domain/conversation/state";
import type { ConversationState } from "#domain/conversation/state";
import { decodeServerFrame } from "#protocol/conversation/frames";

import { bashTurnFrames } from "../../../../test/fixtures/conversation/bash-turn.ts";
import { rowPropsEqual } from "./transcript-row-equal.ts";

const settled = bashTurnFrames
	.map((frame) => decodeServerFrame(frame))
	.reduce(reduce, emptyConversation);

const token = (state: ConversationState, delta: string): ConversationState =>
	reduce(state, { t: "streaming", streamId: "next", blockIndex: 0, kind: "text", delta });

const toolOpen: ReadonlyMap<string, boolean> = new Map();
const onToggleTool = (): void => {};

/** Which rows of `after` would draw again, given the props the transcript hands each. */
const redrawn = (before: ConversationState, after: ConversationState): ReadonlyArray<string> => {
	const previous = transcript(before);
	return transcript(after).flatMap((row) => {
		const old = previous.find((candidate) => candidate.id === row.id);
		if (old === undefined) return [row.id];
		return rowPropsEqual(
			{ onToggleTool, row: old, state: before, toolOpen },
			{ onToggleTool, row, state: after, toolOpen },
		)
			? []
			: [row.id];
	});
};

// `Row` and `AssistantRow` are `memo` with these comparators (transcript-rows.tsx). There is no DOM
// renderer here, so the proof is the comparator itself on the rows `transcript()` builds.
describe("transcript row memo", () => {
	test("a settled row does not draw again while another streams", () => {
		const first = token(settled, "Hel");
		const second = token(first, "lo");
		// The streaming row is the only one that changes; every settled row keeps its picture.
		expect(redrawn(first, second)).toEqual(["next"]);
		expect(redrawn(settled, first)).toEqual(["next"]);
		expect(transcript(second).length).toBeGreaterThan(2);
	});

	test("a row draws again when its own tool call changes", () => {
		const run = settled.tools[0];
		if (run === undefined) throw new Error("the fixture has a tool run");
		const changed: ConversationState = {
			...settled,
			tools: settled.tools.map((tool) => (tool === run ? { ...run, output: "other" } : tool)),
		};
		expect(redrawn(settled, changed)).toContain("a1");
	});

	test("a row draws again when thinking is hidden", () => {
		const hidden: ConversationState = { ...settled, hideThinking: true };
		expect(redrawn(settled, hidden)).toContain("a1");
	});

	test("opening another card does not redraw a row", () => {
		const before = transcript(settled).find((row) => row.id === "a1");
		if (before === undefined) throw new Error("the fixture has a1");
		const props = { onToggleTool, row: before, state: settled };
		expect(
			rowPropsEqual({ ...props, toolOpen }, { ...props, toolOpen: new Map([["elsewhere", true]]) }),
		).toBe(true);
		expect(
			rowPropsEqual({ ...props, toolOpen }, { ...props, toolOpen: new Map([["call-1", true]]) }),
		).toBe(false);
	});
});
