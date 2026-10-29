import { describe, expect, test } from "bun:test";

import { failedTurn } from "./fixtures/failed-turn";
import { transcript } from "./selectors";
import { emptyConversation } from "./state";

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
});
