import { expect, test } from "bun:test";

import { transcriptOf } from "../src/engine/translate.ts";

/**
 * pi's history entries the wire draws as rows of their own. A compaction and a branch
 * summary are content, not notices: they stay at their point in the chat.
 */

const ts = Date.parse("2026-01-01T00:00:00.000Z");

test("a compaction becomes a summary row with pi's own label", () => {
	const row = transcriptOf({
		type: "compaction",
		id: "c1",
		parentId: "e1",
		timestamp: "2026-01-01T00:00:00.000Z",
		summary: "the conversation so far",
		firstKeptEntryId: "e2",
		tokensBefore: 12_345,
	});

	expect(row).toEqual({
		id: "c1",
		label: "Compacted from 12k tokens",
		parentId: "e1",
		role: "summary",
		text: "the conversation so far",
		ts,
	});
});

test("a branch summary names itself", () => {
	const row = transcriptOf({
		type: "branch_summary",
		id: "b1",
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
		fromId: "e1",
		summary: "the branch left behind",
	});

	expect(row).toMatchObject({
		label: "branch summary",
		role: "summary",
		text: "the branch left behind",
	});
});

test("an extension's custom message becomes a summary row named by its type", () => {
	const row = transcriptOf({
		type: "custom_message",
		customType: "note",
		content: "hello from the extension",
		display: true,
		id: "x1",
		parentId: "e1",
		timestamp: "2026-01-01T00:00:00.000Z",
	});

	expect(row).toEqual({
		id: "x1",
		label: "note",
		parentId: "e1",
		role: "summary",
		text: "hello from the extension",
		ts,
	});
});

test("a custom message pi hides stays out of the transcript", () => {
	const hidden = transcriptOf({
		type: "custom_message",
		customType: "note",
		content: "quiet",
		display: false,
		id: "x2",
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
	});
	expect(hidden).toBeUndefined();
});

test("a bookkeeping custom entry never becomes a row", () => {
	const row = transcriptOf({
		type: "custom",
		customType: "permission-state",
		data: { mode: "ask" },
		id: "x3",
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
	});
	expect(row).toBeUndefined();
});

test("a tool's own calls are kept on its result, as the wire's nested rows", () => {
	const row = transcriptOf({
		type: "message",
		id: "t1",
		parentId: "a1",
		timestamp: "2026-01-01T00:00:00.000Z",
		message: {
			role: "toolResult",
			toolCallId: "c1",
			toolName: "codemode",
			content: [{ type: "text", text: "done" }],
			isError: false,
			timestamp: 1,
			nestedCalls: {
				calls: [
					{
						id: "c1/1",
						name: "bash",
						arguments: { command: "ls" },
						status: "error",
						durationMs: 12,
						error: "ls: no such directory",
					},
					{ id: "c1/2", name: "read", status: "ok", durationMs: 3 },
				],
				complete: true,
			},
		},
	});

	expect(row?.role === "toolResult" ? row.nested : undefined).toEqual({
		calls: [
			{
				args: { command: "ls" },
				durationMs: 12,
				error: "ls: no such directory",
				id: "c1/1",
				name: "bash",
				status: "error",
			},
			{ durationMs: 3, id: "c1/2", name: "read", status: "ok" },
		],
		complete: true,
	});
});
