import { describe, expect, test } from "bun:test";

import { failedTurn } from "./fixtures/failed-turn";
import { transcript } from "./selectors";
import { emptyConversation } from "./state";
import type { ConversationMessage } from "./state";

/**
 * A refused provider call is an assistant message with `stopReason: "error"`.
 * Dropping it made a failed turn look like an idle screen, which is what a real
 * OpenRouter 402 did before this check existed.
 */
describe("transcript", () => {
	test("a failed assistant message becomes an error notice", () => {
		const rows = transcript({ ...emptyConversation, messages: [...failedTurn] });
		const notice = rows.find((row) => row.kind === "notice");
		expect(notice?.kind).toBe("notice");
		if (notice?.kind !== "notice") throw new Error("expected a notice row");
		expect(notice.notice.kind).toBe("error");
		expect(notice.notice.text).toContain("openrouter/moonshotai/kimi-k2.6");
		expect(notice.notice.text).toContain("402");
	});

	/**
	 * pi keeps a reply's blocks in the order the model wrote them, so the row has to
	 * render them that way. Joining all text and all thinking instead put every
	 * thought above the prose.
	 */
	test("an interleaved reply renders its blocks in order", () => {
		const failed = failedTurn[1];
		if (failed?.role !== "assistant") throw new Error("expected an assistant message");
		const reply = {
			...failed,
			content: [
				{ type: "text", text: "before" },
				{ type: "thinking", thinking: "thought" },
				{ type: "text", text: "after" },
			],
			stopReason: "stop",
		} satisfies ConversationMessage;
		const rows = transcript({ ...emptyConversation, messages: [reply] });
		const row = rows.find((candidate) => candidate.kind === "assistant");
		if (row?.kind !== "assistant") throw new Error("expected an assistant row");
		expect(row.segments).toEqual([
			{ kind: "text", text: "before" },
			{ kind: "thinking", text: "thought" },
			{ kind: "text", text: "after" },
		]);
	});

	/**
	 * A stop is recorded on the message, so a row derived from it survives a reload.
	 * Without one, a cancelled turn looked like a reply that simply ended.
	 */
	test("a stopped turn says it was stopped", () => {
		const failed = failedTurn[1];
		if (failed?.role !== "assistant") throw new Error("expected an assistant message");
		const stopped = {
			...failed,
			content: [{ type: "text", text: "partial" }],
			stopReason: "aborted",
		} satisfies ConversationMessage;
		const rows = transcript({ ...emptyConversation, messages: [stopped] });
		const notice = rows.find((row) => row.kind === "notice");
		if (notice?.kind !== "notice") throw new Error("expected a notice row");
		expect(notice.notice.text).toBe("Operation aborted");
	});
});

/**
 * pi records a `!cmd` as a `bashExecution` message carrying `cancelled`,
 * `truncated` and the path of the full output. Its own card says so; a row that
 * dropped them looked like a command that simply finished.
 */
describe("a shell row", () => {
	const bashMessage = (
		fields: Partial<Extract<ConversationMessage, { role: "bashExecution" }>>,
	): Extract<ConversationMessage, { role: "bashExecution" }> => ({
		role: "bashExecution",
		command: "sleep 99",
		output: "partial",
		exitCode: undefined,
		cancelled: false,
		truncated: false,
		timestamp: 5,
		...fields,
	});
	const rowOf = (fields: Partial<Extract<ConversationMessage, { role: "bashExecution" }>>) => {
		const rows = transcript({ ...emptyConversation, messages: [bashMessage(fields)] });
		const row = rows.find((candidate) => candidate.kind === "tool");
		if (row?.kind !== "tool") throw new Error("expected a tool row");
		return row.run;
	};

	test("a cancelled command reads as cancelled, not as a success", () => {
		const run = rowOf({ cancelled: true });
		expect(run.status).toBe("error");
		expect(run.note).toBe("(cancelled)");
	});

	test("a truncated command names the file with the rest", () => {
		const run = rowOf({ truncated: true, fullOutputPath: "/tmp/epsilon-full.txt" });
		expect(run.note).toBe("Output truncated. Full output: /tmp/epsilon-full.txt");
	});

	test("a failing exit code is the reason the row failed", () => {
		const run = rowOf({ exitCode: 2 });
		expect(run.status).toBe("error");
		expect(run.note).toBe("(exit 2)");
	});
});
