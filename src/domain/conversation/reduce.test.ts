import { describe, expect, test } from "bun:test";

import { decodeServerFrame } from "#protocol/conversation/frames";
import type { ServerFrame, TreeEntry } from "#protocol/conversation/frames";
import { frameTags, PROTOCOL_VERSION } from "#protocol/rpc";

import { bashTurnFrames } from "./fixtures/bash-turn.ts";
import { failedTurnFrames } from "./fixtures/failed-turn.ts";
import { toolTurnFrames } from "./fixtures/tool-turn.ts";
import { reduce } from "./reduce.ts";
import type { ConversationState } from "./state.ts";
import { emptyConversation, noticeLimit } from "./state.ts";

const replay = (frames: ReadonlyArray<ServerFrame>): ConversationState =>
	frames.reduce(reduce, emptyConversation);

/** The frame at `index`, which every fixture has: a missing one is a broken fixture. */
function frameAt(frames: ReadonlyArray<ServerFrame>, index: number): ServerFrame {
	const frame = frames[index];
	if (frame === undefined) throw new Error(`fixture has no frame at ${index}`);
	return frame;
}

describe("frames", () => {
	test("every frame tag has a sample and decodes", () => {
		const samples: ReadonlyArray<ServerFrame> = [
			...bashTurnFrames,
			...failedTurnFrames,
			...toolTurnFrames,
			{ t: "prepend", entries: [], hasOlder: false },
			{ t: "streamingEnd", streamId: "stream-1" },
			{
				t: "dialog",
				question: { kind: "confirm", id: "d1", title: "Continue?", message: undefined },
			},
			{ t: "dialogClosed", id: "d1" },
			{
				t: "sessionMeta",
				sessionId: "s1",
				title: "Renamed",
				model: "stub-model",
				thinking: "high",
				tools: ["bash", "read"],
			},
			{ t: "editorText", text: "the message a move undid", nonce: "n1" },
			{
				t: "tree",
				entries: [
					{
						id: "u1",
						parentId: null,
						kind: "user",
						label: "run the tests",
						ts: 1_000,
						onPath: true,
					},
				],
			},
		];
		// The version covers exactly the tags the socket can carry: adding a frame without
		// naming it here means a stale tab would meet a frame it cannot decode.
		expect(new Set(samples.map((sample) => sample.t))).toEqual(new Set(frameTags));
		expect(PROTOCOL_VERSION).toBe("4");
		for (const sample of samples) expect(() => decodeServerFrame(sample)).not.toThrow();
	});
});

describe("reduce", () => {
	test("replays a bash turn to one transcript with its tool output", () => {
		const state = replay(bashTurnFrames);
		expect(state.entries.map((entry) => entry.id)).toEqual(["u1", "a1", "t1", "a2"]);
		expect(state.streaming).toHaveLength(0);
		expect(state.tools).toHaveLength(1);
		expect(state.tools[0]?.status).toBe("ok");
		expect(state.tools[0]?.output).toContain("README.md");
		expect(state.tools[0]?.durationMs).toBe(41);
		expect(state.busy).toBe(false);
	});

	test("replaces the streaming row when its entry arrives", () => {
		const afterSnapshot = reduce(emptyConversation, frameAt(bashTurnFrames, 0));
		const afterDelta = reduce(afterSnapshot, {
			t: "streaming",
			streamId: "stream-1",
			blockIndex: 0,
			kind: "text",
			delta: "Running",
		});
		expect(afterDelta.streaming).toHaveLength(1);
		const resolved = reduce(afterDelta, frameAt(bashTurnFrames, 4));
		expect(resolved.streaming).toHaveLength(0);
		expect(resolved.entries.filter((entry) => entry.role === "assistant")).toHaveLength(1);
	});

	test("appends deltas at their own block index", () => {
		const start = reduce(emptyConversation, {
			t: "streaming",
			streamId: "s",
			blockIndex: 0,
			kind: "text",
			delta: "a",
		});
		const next = reduce(start, {
			t: "streaming",
			streamId: "s",
			blockIndex: 0,
			kind: "text",
			delta: "b",
		});
		const thinking = reduce(next, {
			t: "streaming",
			streamId: "s",
			blockIndex: 1,
			kind: "thinking",
			delta: "hmm",
		});
		expect(thinking.streaming[0]?.blocks).toEqual([
			{ kind: "text", text: "ab" },
			{ kind: "thinking", text: "hmm" },
		]);
	});

	test("tool deltas replace the output instead of appending it", () => {
		const first = reduce(emptyConversation, {
			t: "toolDelta",
			toolCallId: "c1",
			entryId: "a1",
			toolName: "bash",
			status: "running",
			output: "one\n",
		});
		const second = reduce(first, {
			t: "toolDelta",
			toolCallId: "c1",
			entryId: "a1",
			toolName: "bash",
			status: "running",
			output: "one\ntwo\n",
		});
		expect(second.tools[0]?.output).toBe("one\ntwo\n");
		expect(second.tools).toHaveLength(1);
	});

	test("an older page is prepended without duplicating an entry", () => {
		const snapshot = reduce(emptyConversation, {
			t: "snapshot",
			sessionId: "s",
			entries: [{ role: "user", id: "u2", parentId: "u1", ts: 2, text: "later", images: [] }],
			hasOlder: true,
			notices: [],
		});
		const older = reduce(snapshot, {
			t: "prepend",
			entries: [
				{ role: "user", id: "u1", parentId: null, ts: 1, text: "earlier", images: [] },
				{ role: "user", id: "u2", parentId: "u1", ts: 2, text: "later", images: [] },
			],
			hasOlder: false,
		});
		expect(older.entries.map((entry) => entry.id)).toEqual(["u1", "u2"]);
		expect(older.hasOlder).toBe(false);
	});

	test("caps notices and keeps the newest", () => {
		let state = emptyConversation;
		for (let index = 0; index < noticeLimit + 5; index++) {
			state = reduce(state, {
				t: "notice",
				id: `n${index}`,
				kind: "notice",
				text: `notice ${index}`,
			});
		}
		expect(state.notices).toHaveLength(noticeLimit);
		expect(state.notices[0]?.text).toBe("notice 5");
		expect(state.notices.at(-1)?.text).toBe(`notice ${noticeLimit + 4}`);
		expect(state.notices.at(-1)?.afterEntryId).toBeNull();
	});

	test("a dialog is closed by id, not by kind", () => {
		const asked = reduce(emptyConversation, {
			t: "dialog",
			question: { kind: "select", id: "d1", title: "Which?", options: ["a", "b"] },
		});
		expect(asked.dialogs).toHaveLength(1);
		expect(reduce(asked, { t: "dialogClosed", id: "d1" }).dialogs).toHaveLength(0);
	});

	test("a foreign write marks the chat read-only until a snapshot clears it", () => {
		const drifted = replay(failedTurnFrames);
		expect(drifted.drift).toContain("outside Epsilon");
		const reloaded = reduce(drifted, frameAt(bashTurnFrames, 0));
		expect(reloaded.drift).toBeUndefined();
	});

	test("sessionMeta carries the controls, and editorText becomes the draft", () => {
		const meta = reduce(emptyConversation, {
			t: "sessionMeta",
			sessionId: "s1",
			thinking: "high",
			tools: ["bash"],
		});
		expect(meta.thinking).toBe("high");
		expect(meta.activeTools).toEqual(["bash"]);
		const drafted = reduce(meta, { t: "editorText", text: "back to here", nonce: "n1" });
		expect(drafted.draft).toEqual({ nonce: "n1", text: "back to here" });
	});

	test("a 50,000-entry flat tree reduces without recursion", () => {
		const tree: TreeEntry[] = [];
		for (let index = 0; index < 50_000; index++) {
			tree.push({
				id: `e${index}`,
				parentId: index === 0 ? null : `e${index - 1}`,
				kind: "user",
				label: `entry ${index}`,
				ts: index,
				onPath: true,
			});
		}
		const state = reduce(emptyConversation, {
			t: "snapshot",
			sessionId: "long",
			entries: [],
			hasOlder: true,
			notices: [],
		});
		const withTree = reduce(state, { t: "tree", entries: tree });
		expect(withTree.tree).toHaveLength(50_000);
		expect(withTree.tree.at(-1)?.id).toBe("e49999");
	});
});
