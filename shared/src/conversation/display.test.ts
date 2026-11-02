/**
 * The display-only half of the socket: a frame that shows something and never
 * waits for an answer. An extension's `notify` carries its own severity, and the
 * reducer keeps it, so an error from an extension is not drawn like a status line.
 */
import { describe, expect, test } from "bun:test";

import { serverFrameSchema } from "../protocol/frames";
import { reduce } from "./reduce";
import { emptyConversation } from "./state";

const sessionId = "test";

/** A notify frame exactly as a browser parses it, so the schema is part of the test. */
const notify = (notifyType: "info" | "warning" | "error" | undefined): string => {
	const request = { method: "notify", message: `an extension said ${notifyType}`, notifyType };
	const state = reduce(emptyConversation, serverFrameSchema.parse({ t: "ui", sessionId, request }));
	return state.notices[0]?.kind ?? "missing";
};

describe("an extension notification", () => {
	test("keeps the severity it was sent with", () => {
		expect(notify("error")).toBe("error");
		expect(notify("warning")).toBe("warning");
	});

	test("reads as an ordinary notice when pi sent no severity", () => {
		expect(notify(undefined)).toBe("notice");
		expect(notify("info")).toBe("notice");
	});
});
