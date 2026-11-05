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
