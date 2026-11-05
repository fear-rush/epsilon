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
}): UiHost => ({
	addAutocompleteProvider: () => undefined,
	ask: () => Promise.reject(new Error("no question expected")),
	editorText: () => "",
	notice: () => undefined,
	setStatus: () => undefined,
	setWidget: (key, lines, placement) => log.widgets.push({ key, lines, placement }),
	setToolsExpanded: () => undefined,
	toolsExpanded: () => false,
	unsupported: (method) => log.refused.push(method),
});

test("a text widget travels keyed, and a component factory is refused", () => {
	const log = { refused: [] as string[], widgets: [] as Parameters<typeof hostOf>[0]["widgets"] };
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
