/**
 * A dialog answer must settle the kind of question it names, and only once. A
 * stale tab or a wrong method is refused instead of silently cancelling a run.
 */
import { describe, expect, test } from "bun:test";
import type { ServerFrame } from "shared";

import { Dialogs } from "./dialogs";

const make = () => {
	const frames: ServerFrame[] = [];
	const dialogs = new Dialogs(
		"check",
		(frame) => frames.push(frame),
		() => undefined,
	);
	return { dialogs, frames };
};

describe("extension dialogs", () => {
	test("answers only the method the question asked for", async () => {
		const { dialogs, frames } = make();
		const pending = dialogs.ask({
			id: "q1",
			method: "confirm",
			title: "Allow?",
			message: "rm -rf",
		});

		expect(dialogs.answer({ id: "q1", method: "select", value: "yes" })).toBe("mismatch");
		expect(dialogs.needsInput).toBe(true);

		expect(dialogs.answer({ id: "q1", method: "confirm", confirmed: true })).toBe("answered");
		expect(await pending).toEqual({ id: "q1", method: "confirm", confirmed: true });
		expect(dialogs.needsInput).toBe(false);
		expect(dialogs.answer({ id: "q1", method: "confirm", confirmed: true })).toBe("stale");
		expect(frames.map((frame) => frame.t)).toEqual(["dialog", "dialog-closed"]);
	});

	test("an abort cancels every pending dialog", async () => {
		const { dialogs, frames } = make();
		const first = dialogs.ask({ id: "a", method: "input", title: "Name?" });
		const second = dialogs.ask({ id: "b", method: "select", title: "Pick", options: ["x"] });

		dialogs.cancelAll();

		expect(await first).toEqual({ id: "a", method: "cancel" });
		expect(await second).toEqual({ id: "b", method: "cancel" });
		expect(dialogs.needsInput).toBe(false);
		expect(frames.filter((frame) => frame.t === "dialog-closed")).toHaveLength(2);
	});
});
