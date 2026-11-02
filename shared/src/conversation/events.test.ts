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

describe("a compaction", () => {
	const result = {
		summary: "what happened so far",
		firstKeptEntryId: "entry-1",
		tokensBefore: 12_345,
		estimatedTokensAfter: 2_000,
		usage: {
			input: 100,
			output: 20,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 120,
			cost: { input: 0.04, output: 0.01, cacheRead: 0, cacheWrite: 0, total: 0.05 },
		},
	};
	const end = (
		fields: Partial<Extract<JsonAgentSessionEvent, { type: "compaction_end" }>>,
	): JsonAgentSessionEvent => ({
		type: "compaction_end",
		reason: "manual",
		result: undefined,
		aborted: false,
		willRetry: false,
		...fields,
	});
	const noticeOf = (event: JsonAgentSessionEvent) => {
		const state = feed([event]);
		return state.notices.at(-1);
	};

	test("reports how much it replaced and what it billed", () => {
		const notice = noticeOf(end({ result }));
		expect(notice?.text).toBe("Compacted from 12k tokens (120 tokens billed, $0.05)");
		expect(notice?.kind).toBe("compaction");
	});

	test("a cancelled compaction reads as cancelled, by its own reason", () => {
		expect(noticeOf(end({ aborted: true }))?.text).toBe("Compaction cancelled");
		expect(noticeOf(end({ aborted: true, reason: "threshold" }))?.text).toBe(
			"Auto-compaction cancelled",
		);
	});

	test("a failed compaction reports pi's message as a failure", () => {
		const notice = noticeOf(end({ errorMessage: "context length exceeded" }));
		expect(notice?.kind).toBe("error");
		expect(notice?.text).toBe("Compaction failed: context length exceeded");
	});

	test("a summarization retry keeps the compaction visible while it runs", () => {
		const retried = feed([
			end({ errorMessage: "provider timeout" }),
			{
				type: "summarization_retry_scheduled",
				attempt: 1,
				maxAttempts: 3,
				delayMs: 2_000,
				errorMessage: "provider timeout",
			},
			{ type: "summarization_retry_attempt_start", source: "compaction", reason: "manual" },
		]);
		expect(retried.isCompacting).toBe(true);
		expect(retried.notices.at(-1)?.text).toContain("Retrying the summary (attempt 1 of 3 in 2s)");
	});
});

describe("a nested tool call", () => {
	const parentCall = {
		type: "toolCall",
		id: "call-1",
		name: "codemode",
		arguments: { code: "await tools.bash({ command: 'ls' })" },
	} satisfies AssistantMessage["content"][number];
	const assistant = assistantMessage([parentCall], "stop");

	test("stays inside its parent's card while it streams", () => {
		const state = feed([
			{ type: "message_end", message: assistant },
			{
				type: "tool_execution_start",
				toolCallId: "call-1",
				toolName: "codemode",
				args: parentCall.arguments,
			},
			{
				type: "tool_execution_start",
				toolCallId: "call-1/1",
				toolName: "bash",
				args: { command: "ls" },
				parentToolCallId: "call-1",
			},
		]);
		const rows = transcript(state).filter((row) => row.kind === "tool");
		expect(rows).toHaveLength(1);
		const parent = rows[0];
		if (parent?.kind !== "tool") throw new Error("expected the parent row");
		expect(parent.run.toolName).toBe("codemode");
		expect(parent.children.map((child) => child.run.toolName)).toEqual(["bash"]);
	});

	test("is kept from pi's record on the parent's result", () => {
		const result = {
			role: "toolResult",
			toolCallId: "call-1",
			toolName: "codemode",
			content: [{ type: "text", text: "done" }],
			isError: false,
			timestamp: 4,
			nestedCalls: {
				calls: [
					{
						id: "call-1/1",
						name: "bash",
						arguments: { command: "ls" },
						status: "error",
						durationMs: 12,
						error: "ls: no such directory",
					},
				],
				complete: true,
			},
		} satisfies Extract<ConversationMessage, { role: "toolResult" }>;
		// A reattach is where pi's record is read: the snapshot rebuilds the tools.
		const base = snapshotOf("./fixtures/session-snapshot.json");
		if (base.t !== "snapshot") throw new Error("expected a snapshot fixture");
		const state = reduce(emptyConversation, {
			t: "snapshot",
			sessionId,
			snapshot: { ...base.snapshot, messages: [assistant, result] },
		});
		const rows = transcript(state).filter((row) => row.kind === "tool");
		expect(rows).toHaveLength(1);
		const parent = rows[0];
		if (parent?.kind !== "tool") throw new Error("expected the parent row");
		const child = parent.children[0];
		expect(child?.run.toolName).toBe("bash");
		expect(child?.run.status).toBe("error");
		expect(child?.run.note).toBe("ls: no such directory");
	});
});

describe("an extension entry", () => {
	const appended = (display: boolean): JsonAgentSessionEvent => ({
		type: "entry_appended",
		entry: {
			type: "custom_message",
			customType: "note",
			content: "hello from the extension",
			display,
			id: "entry-1",
			parentId: null,
			timestamp: "2026-01-01T00:00:00.000Z",
		},
	});

	test("a custom message entry becomes a row when pi would show it", () => {
		const state = feed([appended(true)]);
		expect(transcript(state).filter((row) => row.kind === "summary")).toHaveLength(1);
	});

	test("an entry with display false is hidden, as pi hides it", () => {
		const state = feed([appended(false)]);
		expect(transcript(state).filter((row) => row.kind === "summary")).toHaveLength(0);
	});

	test("a bookkeeping custom entry stays out of the transcript", () => {
		const state = feed([
			{
				type: "entry_appended",
				entry: {
					type: "custom",
					customType: "permission-state",
					data: { mode: "ask" },
					id: "entry-2",
					parentId: null,
					timestamp: "2026-01-01T00:00:00.000Z",
				},
			},
		]);
		expect(transcript(state)).toHaveLength(0);
	});

	test("a custom message with display false is hidden too", () => {
		const hidden = {
			role: "custom",
			customType: "note",
			content: "quiet",
			display: false,
			timestamp: 1,
		} satisfies ConversationMessage;
		expect(transcript({ ...emptyConversation, messages: [hidden] })).toHaveLength(0);
	});
});

describe("thinking display", () => {
	test("pi's hideThinkingBlock removes thinking from finished and streaming replies", () => {
		const reply = assistantMessage(
			[
				{ type: "thinking", thinking: "considered" },
				{ type: "text", text: "answered" },
			],
			"stop",
		);
		// The same message object, so the row cache has to answer for both settings.
		const shown = transcript({ ...emptyConversation, messages: [reply] });
		const hidden = transcript({ ...emptyConversation, messages: [reply], hideThinkingBlock: true });
		const segmentsOf = (rows: ReturnType<typeof transcript>) => {
			const row = rows.find((candidate) => candidate.kind === "assistant");
			if (row?.kind !== "assistant") throw new Error("expected an assistant row");
			return row.segments;
		};
		expect(segmentsOf(shown)).toHaveLength(2);
		expect(segmentsOf(hidden)).toEqual([{ kind: "text", text: "answered" }]);

		const streaming = feed([
			{ type: "message_start", message: assistantMessage([], "stop") },
			update({ type: "thinking_start", contentIndex: 0 }),
			update({ type: "thinking_delta", contentIndex: 0, delta: "considered" }),
		]);
		expect(transcript(streaming).filter((row) => row.kind === "assistant")).toHaveLength(1);
		expect(
			transcript({ ...streaming, hideThinkingBlock: true }).filter(
				(row) => row.kind === "assistant",
			),
		).toHaveLength(0);
	});
});
