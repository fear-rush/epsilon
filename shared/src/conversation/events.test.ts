/**
 * A turn as the reducer reads it: pi's streaming blocks in pi's order, the settle
 * that ends a run, and where a notice lands after history is replaced.
 *
 * The traces here are written from pi's event shape (`docs/json.md`, "Streaming
 * deltas") rather than captured, because no recording in this repository has a
 * provider that interleaves text and thinking inside one message. Every frame
 * still goes through the socket schema, the same check a browser applies.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { JsonAgentSessionEvent } from "../pi";
import { serverFrameSchema } from "../protocol/frames";
import { reduce } from "./reduce";
import { transcript } from "./selectors";
import { emptyConversation } from "./state";
import type { ConversationMessage, ConversationState } from "./state";

const sessionId = "test";

const frame = (event: JsonAgentSessionEvent) =>
	serverFrameSchema.parse({ t: "event", sessionId, event });

const feed = (events: JsonAgentSessionEvent[]): ConversationState =>
	events.reduce((state, event) => reduce(state, frame(event)), emptyConversation);

type AssistantMessage = Extract<ConversationMessage, { role: "assistant" }>;
type JsonDelta = Extract<
	JsonAgentSessionEvent,
	{ type: "message_update" }
>["assistantMessageEvent"];

const usage = {
	input: 1,
	output: 1,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 2,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const assistantMessage = (
	content: AssistantMessage["content"],
	stopReason: "stop" | "aborted",
): AssistantMessage => ({
	role: "assistant",
	content,
	api: "openai-completions",
	provider: "openrouter",
	model: "moonshotai/kimi-k2.6",
	usage,
	stopReason,
	timestamp: 3,
});

/** One of pi's `message_update` events, which carries the block index. */
const update = (assistantMessageEvent: JsonDelta): JsonAgentSessionEvent => ({
	type: "message_update",
	usage,
	assistantMessageEvent,
});

const snapshotOf = (path: string) =>
	serverFrameSchema.parse(JSON.parse(readFileSync(join(import.meta.dirname, path), "utf8")));

describe("a streaming reply", () => {
	test("keeps text, thinking and text in pi's block order", () => {
		const state = feed([
			{ type: "message_start", message: assistantMessage([], "stop") },
			update({ type: "text_start", contentIndex: 0 }),
			update({ type: "text_delta", contentIndex: 0, delta: "before" }),
			update({ type: "text_end", contentIndex: 0, content: "before" }),
			update({ type: "thinking_start", contentIndex: 1 }),
			update({ type: "thinking_delta", contentIndex: 1, delta: "thought" }),
			update({ type: "thinking_end", contentIndex: 1, content: "thought" }),
			update({ type: "text_start", contentIndex: 2 }),
			update({ type: "text_delta", contentIndex: 2, delta: "after" }),
		]);
		const row = transcript(state).find((candidate) => candidate.kind === "assistant");
		if (row?.kind !== "assistant") throw new Error("expected a streaming row");
		expect(row.segments).toEqual([
			{ kind: "text", text: "before" },
			{ kind: "thinking", text: "thought" },
			{ kind: "text", text: "after" },
		]);
	});
});

describe("the end of a run", () => {
	const toolCall = {
		type: "toolCall",
		id: "call-1",
		name: "bash",
		arguments: { command: "sleep 99" },
	} satisfies AssistantMessage["content"][number];
	const running = feed([
		{ type: "agent_start" },
		{
			type: "tool_execution_start",
			toolCallId: "call-1",
			toolName: "bash",
			args: { command: "sleep 99" },
		},
	]);

	test("`agent_end` does not end the run; the settle after it does", () => {
		const ended = reduce(running, frame({ type: "agent_end", messages: [], willRetry: false }));
		expect(ended.busy).toBe(true);
		const settled = reduce(ended, frame({ type: "agent_settled", aborted: true }));
		expect(settled.busy).toBe(false);
	});

	test("a tool still running at the settle reads as not executed", () => {
		const stopped = feed([
			{ type: "agent_start" },
			{
				type: "tool_execution_start",
				toolCallId: "call-1",
				toolName: "bash",
				args: { command: "sleep 99" },
			},
			{ type: "message_end", message: assistantMessage([toolCall], "aborted") },
			{ type: "agent_settled", aborted: true },
		]);
		const rows = transcript(stopped).filter((row) => row.kind === "tool");
		expect(rows).toHaveLength(1);
		const row = rows[0];
		if (row?.kind !== "tool") throw new Error("expected a tool row");
		expect(row.run.status).toBe("error");
		expect(row.run.note).toContain("Not executed");
	});
});

describe("a notice", () => {
	test("stays at the compaction point when the snapshot holds less history", () => {
		const base = snapshotOf("./fixtures/session-snapshot.json");
		if (base.t !== "snapshot") throw new Error("expected a snapshot fixture");
		let state = reduce(emptyConversation, base);
		const before = state.messages.length;

		state = reduce(state, {
			t: "notice",
			sessionId,
			kind: "command",
			text: "Compacting the conversation",
		});
		expect(state.notices[0]?.afterMessages).toBe(before);

		// A compaction replaces history with a summary and a few kept messages.
		const summary = {
			role: "compactionSummary" as const,
			summary: "…",
			tokensBefore: 1200,
			timestamp: 1,
		};
		const kept = base.snapshot.messages.slice(-1);
		state = reduce(state, {
			t: "snapshot",
			sessionId,
			snapshot: { ...base.snapshot, messages: [summary, ...kept] },
		});
		// Right after the summary, which is where the history was rebuilt.
		expect(state.notices[0]?.afterMessages).toBe(1);

		// Later messages must not move it again.
		state = reduce(
			state,
			frame({
				type: "message_end",
				message: { role: "user", content: [{ type: "text", text: "again" }], timestamp: 2 },
			}),
		);
		const rows = transcript(state);
		expect(rows.findIndex((row) => row.kind === "notice")).toBe(1);
		expect(rows.at(-1)?.kind).toBe("user");
	});
});
