import { expect, test } from "bun:test";

import { createUiContext } from "../src/engine/ui.ts";
import type { UiHost } from "../src/engine/ui.ts";

/**
 * pi's `setWidget` on the engine's side: text lines travel as one keyed entry, and a
 * component factory is refused with a notice instead of being dropped.
 */

const hostOf = (log: {
	widgets: Array<{
		key: string;
		lines: ReadonlyArray<string> | undefined;
		placement: string | undefined;
	}>;
	refused: string[];
	labels: string[];
	edits: Array<{ text: string; mode: "replace" | "append" }>;
	working: Array<string | undefined>;
	visible: boolean[];
}): UiHost => ({
	addAutocompleteProvider: () => undefined,
	ask: () => Promise.reject(new Error("no question expected")),
	editorText: () => "",
	notice: () => undefined,
	setHiddenThinkingLabel: (label) => log.labels.push(label),
	setStatus: () => undefined,
	setWidget: (key, lines, placement) => log.widgets.push({ key, lines, placement }),
	setToolsExpanded: () => undefined,
	toolsExpanded: () => false,
	putEditorText: (text, mode) => log.edits.push({ text, mode }),
	setWorkingMessage: (message) => log.working.push(message),
	setWorkingVisible: (visible) => log.visible.push(visible),
	unsupported: (method) => log.refused.push(method),
});

test("a text widget travels keyed, and a component factory is refused", () => {
	const log = {
		edits: [] as Array<{ text: string; mode: "replace" | "append" }>,
		labels: [] as string[],
		refused: [] as string[],
		visible: [] as boolean[],
		widgets: [] as Parameters<typeof hostOf>[0]["widgets"],
		working: [] as Array<string | undefined>,
	};
	const ui = createUiContext(hostOf(log));

	ui.setWidget("card", ["one", "two"], { placement: "belowEditor" });
	ui.setWidget("card", undefined);
	// pi allows a component factory; the browser has no component to draw, and the engine
	// refuses it before the factory is ever called.
	ui.setWidget("card", () => {
		throw new Error("a widget component is never drawn here");
	});

	expect(log.widgets).toEqual([
		{ key: "card", lines: ["one", "two"], placement: "belowEditor" },
		{ key: "card", lines: undefined, placement: undefined },
	]);
	expect(log.refused).toEqual(["setWidget"]);
});

test("the hidden-thinking label reaches the engine", () => {
	const log = { labels: [] as string[], refused: [] as string[] };
	const ui = createUiContext(hostOf({ ...log, edits: [], visible: [], widgets: [], working: [] }));

	ui.setHiddenThinkingLabel("Working it out");

	expect(log.labels).toEqual(["Working it out"]);
});

test("pi's two editor writes stay apart: a replacement and a paste", () => {
	const log = {
		edits: [] as Array<{ text: string; mode: "replace" | "append" }>,
		labels: [] as string[],
		refused: [] as string[],
		visible: [] as boolean[],
		widgets: [] as Parameters<typeof hostOf>[0]["widgets"],
		working: [] as Array<string | undefined>,
	};
	const ui = createUiContext(hostOf(log));

	ui.setEditorText("a draft");
	ui.pasteToEditor(" more");

	expect(log.edits).toEqual([
		{ mode: "replace", text: "a draft" },
		{ mode: "append", text: " more" },
	]);
	// Both have a wire now, so neither is refused with a notice.
	expect(log.refused).toEqual([]);
});

test("an extension's working row reaches the engine, and can be restored", () => {
	const log = {
		edits: [] as Array<{ text: string; mode: "replace" | "append" }>,
		labels: [] as string[],
		refused: [] as string[],
		visible: [] as boolean[],
		widgets: [] as Parameters<typeof hostOf>[0]["widgets"],
		working: [] as Array<string | undefined>,
	};
	const ui = createUiContext(hostOf(log));

	ui.setWorkingMessage("Reading files");
	ui.setWorkingVisible(false);
	ui.setWorkingMessage();

	expect(log.working).toEqual(["Reading files", undefined]);
	expect(log.visible).toEqual([false]);
	expect(log.refused).toEqual([]);
});
