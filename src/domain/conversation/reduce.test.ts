import { describe, expect, test } from "bun:test";

import { decodeServerFrame } from "#protocol/conversation/frames";
import type { ServerFrame, TreeRow } from "#protocol/conversation/frames";
import { frameTags, PROTOCOL_VERSION } from "#protocol/rpc";

import { bashTurnFrames } from "../../../test/fixtures/conversation/bash-turn.ts";
import { failedTurnFrames } from "../../../test/fixtures/conversation/failed-turn.ts";
import { toolTurnFrames } from "../../../test/fixtures/conversation/tool-turn.ts";
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
				autoCompaction: false,
				autoRetry: true,
				hideThinking: true,
				codingTools: true,
				thinkingLevels: ["off", "high"],
			},
			{
				t: "queue",
				steering: ["stop and use the tests"],
				followUp: ["then commit"],
			},
			{
				t: "bash",
				command: "rg --files",
				output: "AGENTS.md\n",
				running: true,
			},
			{
				t: "readings",
				contextUsage: { tokens: 12_000, contextWindow: 200_000, percent: 6 },
				stats: {
					assistantMessages: 2,
					cost: 0.1234,
					tokens: {
						cacheRead: 1_000,
						cacheWrite: 200,
						input: 11_000,
						output: 400,
						total: 12_400,
					},
					toolCalls: 1,
					totalMessages: 5,
					userMessages: 2,
				},
				cacheWarming: { nextWarmAt: 1_700_000_000_000, state: "scheduled" },
			},
			{ t: "busy", busy: true, compacting: true, retrying: true },
			{
				t: "statuses",
				statuses: [{ key: "permission", text: "perm:ask" }],
			},
			{
				t: "widgets",
				widgets: [{ key: "card", placement: "aboveEditor", lines: ["a", "b"] }],
			},
			{ t: "editorText", sessionId: "s1", text: "the message a move undid", nonce: "n1" },
			{
				t: "tree",
				rows: [
					{
						entryId: "u1",
						parentId: null,
						kind: "user",
						text: "run the tests",
						hasText: true,
						active: true,
						current: true,
					},
				],
			},
		];
		// The version covers exactly the tags the socket can carry: adding a frame without
		// naming it here means a stale tab would meet a frame it cannot decode.
		expect(new Set(samples.map((sample) => sample.t))).toEqual(new Set(frameTags));
		expect(PROTOCOL_VERSION).toBe("19");
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

	test("carries the shell command a chat is running and the output pi streamed", () => {
		const state = replay([
			{ t: "bash", command: "rg --files", output: "", running: true },
			{ t: "bash", command: "rg --files", output: "AGENTS.md\n", running: true },
			{ t: "bash", command: "", output: "", running: false },
		]);
		expect(state.bash).toEqual({ command: "", output: "", running: false });
	});

	test("carries the composer's readings: the window, the totals and the warmer", () => {
		const stats = {
			assistantMessages: 2,
			cost: 0.1234,
			tokens: { cacheRead: 1_000, cacheWrite: 200, input: 11_000, output: 400, total: 12_400 },
			toolCalls: 1,
			totalMessages: 5,
			userMessages: 2,
		};
		const state = replay([
			{
				t: "readings",
				contextUsage: { tokens: 12_000, contextWindow: 200_000, percent: 6 },
				stats,
				cacheWarming: { nextWarmAt: 1_700_000_000_000, state: "scheduled" },
			},
		]);
		expect(state.readings).toEqual({
			cacheWarming: { nextWarmAt: 1_700_000_000_000, state: "scheduled" },
			contextUsage: { tokens: 12_000, contextWindow: 200_000, percent: 6 },
			stats,
		});
		// Right after a compaction pi counts no tokens, and the composer hides the meter
		// instead of drawing an empty window; the nulls travel so it can tell the difference.
		const compacted = replay([
			{
				t: "readings",
				contextUsage: { tokens: null, contextWindow: 200_000, percent: null },
				stats,
			},
		]);
		expect(compacted.readings?.contextUsage?.tokens).toBeNull();
		expect(compacted.readings?.cacheWarming).toBeUndefined();
	});

	test("carries the run controls pi holds: the queue, a retry and the meta flags", () => {
		const frames: ReadonlyArray<ServerFrame> = [
			{ t: "queue", steering: ["steer"], followUp: ["follow"] },
			{ t: "busy", busy: true, compacting: false, retrying: true },
			{
				t: "sessionMeta",
				sessionId: "s1",
				autoCompaction: false,
				autoRetry: true,
				hideThinking: true,
				thinkingLevels: ["off", "high"],
			},
		];
		const state = frames.reduce(reduce, emptyConversation);

		expect(state.queue).toEqual({ steering: ["steer"], followUp: ["follow"] });
		expect(state.retrying).toBe(true);
		expect(state.busy).toBe(true);
		expect(state.autoCompaction).toBe(false);
		expect(state.autoRetry).toBe(true);
		expect(state.hideThinking).toBe(true);
		expect(state.thinkingLevels).toEqual(["off", "high"]);
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

	test("a tool result's images reach its run", () => {
		const state = replay([
			{
				t: "append",
				entry: {
					id: "a1",
					parentId: null,
					role: "assistant",
					ts: 1,
					blocks: [
						{
							type: "toolCall",
							toolCallId: "c1",
							toolName: "read",
							args: { path: "shot.png" },
						},
					],
				},
			},
			{
				t: "append",
				entry: {
					id: "t1",
					parentId: "a1",
					role: "toolResult",
					ts: 2,
					toolCallId: "c1",
					toolName: "read",
					isError: false,
					output: "",
					images: [{ type: "image", data: "AAA", mimeType: "image/png" }],
				},
			},
		]);
		expect(state.tools[0]?.images).toHaveLength(1);
		expect(state.tools[0]?.images[0]?.mimeType).toBe("image/png");
		expect(state.tools[0]?.status).toBe("ok");
	});

	test("a settle closes a tool that never reported an end, and says why", () => {
		const running = reduce(emptyConversation, {
			t: "toolDelta",
			toolCallId: "c1",
			entryId: "a1",
			toolName: "bash",
			status: "running",
			output: "one\n",
		});
		const settled = reduce(running, { t: "busy", busy: false });
		expect(settled.tools[0]?.status).toBe("error");
		expect(settled.tools[0]?.note).toBe("Not executed: the run ended before this tool finished.");
	});

	test("a settle leaves a finished tool alone, and a running chat closes nothing", () => {
		const done = reduce(emptyConversation, {
			t: "toolDelta",
			toolCallId: "c1",
			entryId: "a1",
			toolName: "bash",
			status: "ok",
			output: "one\n",
		});
		expect(reduce(done, { t: "busy", busy: false }).tools[0]).toEqual(done.tools[0]);
		const running = reduce(done, {
			t: "toolDelta",
			toolCallId: "c2",
			entryId: "a2",
			toolName: "read",
			status: "running",
		});
		expect(reduce(running, { t: "busy", busy: true }).tools[1]?.status).toBe("running");
	});

	test("a call a tool made draws inside that tool, not beside it", () => {
		const parent = reduce(emptyConversation, {
			t: "toolDelta",
			toolCallId: "c1",
			entryId: "a1",
			toolName: "codemode",
			status: "running",
		});
		const child = reduce(parent, {
			t: "toolDelta",
			toolCallId: "c1/1",
			parentToolCallId: "c1",
			entryId: "a1",
			toolName: "bash",
			status: "running",
			output: "ls\n",
		});
		expect(child.tools).toHaveLength(1);
		expect(child.tools[0]?.children.map((run) => run.toolName)).toEqual(["bash"]);
		const ended = reduce(child, {
			t: "toolDelta",
			toolCallId: "c1/1",
			parentToolCallId: "c1",
			entryId: "a1",
			toolName: "bash",
			status: "ok",
			output: "AGENTS.md\n",
			durationMs: 8,
		});
		expect(ended.tools[0]?.children[0]).toMatchObject({ output: "AGENTS.md\n", status: "ok" });
	});

	test("a result's nested record becomes the parent's children, and a settle closes them", () => {
		const result = reduce(emptyConversation, {
			t: "append",
			entry: {
				id: "t1",
				parentId: "a1",
				role: "toolResult",
				toolCallId: "c1",
				toolName: "codemode",
				isError: false,
				output: "done",
				images: [],
				ts: 1,
				nested: {
					calls: [
						{
							id: "c1/1",
							name: "bash",
							args: { command: "ls" },
							status: "error",
							durationMs: 12,
							error: "ls: no such directory",
						},
						{ id: "c1/2", name: "read", status: "unfinished" },
					],
					complete: true,
				},
			},
		});
		const children = result.tools[0]?.children ?? [];
		expect(children.map((run) => [run.toolName, run.status, run.output])).toEqual([
			["bash", "error", "ls: no such directory"],
			["read", "error", ""],
		]);
		// A live call still running at the settle is closed there, note and all.
		const running = reduce(emptyConversation, {
			t: "toolDelta",
			toolCallId: "c1",
			entryId: "a1",
			toolName: "codemode",
			status: "running",
		});
		const withChild = reduce(running, {
			t: "toolDelta",
			toolCallId: "c1/1",
			parentToolCallId: "c1",
			entryId: "a1",
			toolName: "bash",
			status: "running",
		});
		const settled = reduce(withChild, { t: "busy", busy: false });
		expect(settled.tools[0]?.children[0]).toMatchObject({
			note: "Not executed: the run ended before this tool finished.",
			status: "error",
		});
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
				source: "pi",
				text: `notice ${index}`,
			});
		}
		expect(state.notices).toHaveLength(noticeLimit);
		expect(state.notices[0]).toMatchObject({ source: "pi", text: "notice 5" });
		expect(state.notices.at(-1)).toMatchObject({ text: `notice ${noticeLimit + 4}` });
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
			treeFilterMode: "labeled-only",
		});
		expect(meta.thinking).toBe("high");
		expect(meta.activeTools).toEqual(["bash"]);
		expect(meta.treeFilterMode).toBe("labeled-only");
		// An extension's label survives a later meta without one, and a later label wins.
		const labelled = reduce(meta, {
			t: "sessionMeta",
			sessionId: "s1",
			hiddenThinkingLabel: "Working it out",
		});
		expect(labelled.hiddenThinkingLabel).toBe("Working it out");
		expect(reduce(labelled, { t: "sessionMeta", sessionId: "s1" }).hiddenThinkingLabel).toBe(
			"Working it out",
		);
		const reLabelled = reduce(labelled, {
			t: "sessionMeta",
			sessionId: "s1",
			hiddenThinkingLabel: "Pondering",
		});
		expect(reLabelled.hiddenThinkingLabel).toBe("Pondering");
		const working = reduce(meta, {
			t: "sessionMeta",
			sessionId: "s1",
			workingMessage: "Reading files",
			workingVisible: false,
		});
		expect(working.workingMessage).toBe("Reading files");
		expect(working.workingVisible).toBe(false);
		// An extension's word can be taken back, which restores pi's own.
		expect(
			reduce(working, { t: "sessionMeta", sessionId: "s1", workingMessage: null }).workingMessage,
		).toBeUndefined();
		const drafted = reduce(meta, {
			t: "editorText",
			sessionId: "s1",
			text: "back to here",
			nonce: "n1",
		});
		expect(drafted.draft).toEqual({ nonce: "n1", text: "back to here" });
		// pi's paste adds to what is in the box; its set replaces it.
		const appended = reduce(drafted, {
			t: "editorText",
			sessionId: "s1",
			text: " and this",
			nonce: "n2",
			mode: "append",
		});
		expect(appended.draft).toEqual({ nonce: "n2", text: "back to here and this" });
		const replaced = reduce(appended, {
			t: "editorText",
			sessionId: "s1",
			text: "only this",
			nonce: "n3",
			mode: "replace",
		});
		expect(replaced.draft).toEqual({ nonce: "n3", text: "only this" });
	});

	test("a 50,000-row tree nests without recursion", () => {
		const rows: TreeRow[] = [];
		for (let index = 0; index < 50_000; index++) {
			rows.push({
				entryId: `e${index}`,
				parentId: index === 0 ? null : `e${index - 1}`,
				kind: "user",
				text: `entry ${index}`,
				hasText: true,
				active: true,
				current: index === 49_999,
			});
		}
		const state = reduce(emptyConversation, {
			t: "snapshot",
			sessionId: "long",
			entries: [],
			hasOlder: true,
			notices: [],
		});
		const withTree = reduce(state, { t: "tree", rows });
		// The chain is one root with 49,999 children under it. Walking it by hand keeps
		// this test off the stack, which is the property the nesting has to hold.
		let node = withTree.tree[0];
		let depth = 1;
		while (node?.children[0] !== undefined) {
			node = node.children[0];
			depth += 1;
		}
		expect(withTree.tree).toHaveLength(1);
		expect(depth).toBe(50_000);
		expect(node?.entryId).toBe("e49999");
		expect(node?.current).toBe(true);
	});
});
