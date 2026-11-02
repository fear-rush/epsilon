/**
 * The display-only half of the socket: a frame that shows something and never
 * waits for an answer. An extension's `notify` carries its own severity, and its
 * draft write becomes a request the composer takes, so neither is drawn as a
 * status line or answered with a "not supported" sentence.
 */
import { describe, expect, test } from "bun:test";

import type { ExtensionDisplay } from "../protocol/extui";
import { serverFrameSchema } from "../protocol/frames";
import { reduce, takeEditorRequest } from "./reduce";
import { emptyConversation } from "./state";
import type { ConversationState } from "./state";

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

/** A keyed status write, reducing onto the state a tab already has. */
const status = (state: ConversationState, statusKey: string, statusText?: string) =>
	reduce(
		state,
		serverFrameSchema.parse({
			t: "ui",
			sessionId,
			request: { method: "setStatus", statusKey, statusText },
		}),
	);

describe("an extension status", () => {
	test("keeps the place a key first took when it updates", () => {
		let state = status(emptyConversation, "build", "compiling");
		state = status(state, "test", "running");
		state = status(state, "build", "done");

		expect(state.statuses).toEqual([
			{ key: "build", text: "done" },
			{ key: "test", text: "running" },
		]);
	});

	test("is gone once the extension clears it", () => {
		let state = status(emptyConversation, "build", "compiling");
		state = status(state, "build");

		expect(state.statuses).toEqual([]);
	});
});

/** One session-wide display setting, exactly as a browser parses it. */
const setting = (request: ExtensionDisplay) =>
	reduce(emptyConversation, serverFrameSchema.parse({ t: "ui", sessionId, request }));

describe("an extension's view settings", () => {
	test("a working message replaces pi's word, and clearing it restores that word", () => {
		expect(
			setting({ method: "set_working_message", message: "Reading files" }).workingMessage,
		).toBe("Reading files");
		expect(setting({ method: "set_working_message" }).workingMessage).toBeUndefined();
	});

	test("the working row can be hidden and shown again", () => {
		expect(setting({ method: "set_working_visible", visible: false }).workingVisible).toBe(false);
		expect(setting({ method: "set_working_visible", visible: true }).workingVisible).toBe(true);
	});

	test("the hidden-thinking label is kept and cleared", () => {
		expect(
			setting({ method: "set_hidden_thinking_label", label: "Pondering" }).hiddenThinkingLabel,
		).toBe("Pondering");
		expect(setting({ method: "set_hidden_thinking_label" }).hiddenThinkingLabel).toBeUndefined();
	});

	test("tool cards are expanded for the session", () => {
		expect(setting({ method: "set_tools_expanded", expanded: true }).toolsExpanded).toBe(true);
	});

	test("pi's own defaults are what the state starts with", () => {
		expect(emptyConversation.workingVisible).toBe(true);
		expect(emptyConversation.toolsExpanded).toBe(false);
	});
});
