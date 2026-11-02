/**
 * The display-only half of the socket: a frame that shows something and never
 * waits for an answer. An extension's `notify` carries its own severity, and its
 * draft write becomes a request the composer takes, so neither is drawn as a
 * status line or answered with a "not supported" sentence.
 */
import { describe, expect, test } from "bun:test";

import { serverFrameSchema } from "../protocol/frames";
import { reduce, takeEditorRequest } from "./reduce";
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

/** A draft write from an extension, exactly as a browser parses it. */
const write = (mode: "replace" | "append", text: string) =>
	reduce(
		emptyConversation,
		serverFrameSchema.parse({
			t: "ui",
			sessionId,
			request: { method: "set_editor_text", text, mode },
		}),
	);

describe("an extension's write into the composer", () => {
	test("becomes a request the composer takes, not a notice", () => {
		const replaced = write("replace", "a draft");

		expect(replaced.editorRequest).toEqual({ text: "a draft", mode: "replace" });
		expect(replaced.notices).toEqual([]);
	});

	test("keeps pi's two meanings apart: setEditorText replaces, paste appends", () => {
		expect(write("append", " more").editorRequest).toEqual({ text: " more", mode: "append" });
	});

	test("is spent once the composer has taken it", () => {
		const taken = takeEditorRequest(write("append", "text"));

		expect(taken.editorRequest).toBeUndefined();
	});
});
