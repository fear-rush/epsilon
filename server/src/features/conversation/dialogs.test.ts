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
		() => "check",
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

	test("a timeout answers with the method's default and closes the tab's copy", async () => {
		const { dialogs, frames } = make();
		const pending = dialogs.ask(
			{ id: "q1", method: "confirm", title: "Allow?", message: "rm -rf" },
			{ timeoutMs: 20 },
		);

		expect(await pending).toEqual({ id: "q1", method: "cancel" });
		expect(dialogs.needsInput).toBe(false);
		expect(frames.map((frame) => frame.t)).toEqual(["dialog", "dialog-closed"]);
	});

	test("a late tab counts down from the deadline, not the original span", async () => {
		const { dialogs, frames } = make();
		void dialogs.ask({ id: "q1", method: "input", title: "Name?" }, { timeoutMs: 200 });
		await new Promise((resolve) => setTimeout(resolve, 40));

		const replayed: ServerFrame[] = [];
		dialogs.replay((frame) => replayed.push(frame));
		dialogs.cancelAll();

		const first = frames[0];
		const second = replayed[0];
		if (first?.t !== "dialog" || second?.t !== "dialog") throw new Error("expected dialogs");
		expect(first.request.timeoutMs).toBeLessThanOrEqual(200);
		expect(second.request.timeoutMs).toBeLessThan(200);
	});

	test("a signal that already aborted asks nothing", async () => {
		const { dialogs, frames } = make();
		const controller = new AbortController();
		controller.abort();

		const pending = dialogs.ask(
			{ id: "q1", method: "input", title: "Name?" },
			{ signal: controller.signal },
		);

		expect(await pending).toEqual({ id: "q1", method: "cancel" });
		expect(frames).toEqual([]);
	});

	test("a late tab receives the session's view settings, and no one-off display", () => {
		const { dialogs } = make();
		dialogs.display({ method: "set_working_message", message: "Reading files" });
		dialogs.display({ method: "set_tools_expanded", expanded: true });
		dialogs.display({ method: "notify", message: "only once" });

		const replayed: ServerFrame[] = [];
		dialogs.replay((frame) => replayed.push(frame));

		expect(replayed.map((frame) => (frame.t === "ui" ? frame.request.method : frame.t))).toEqual([
			"set_working_message",
			"set_tools_expanded",
		]);
	});

	test("an aborting signal resolves the dialog and closes it", async () => {
		const { dialogs, frames } = make();
		const controller = new AbortController();
		const pending = dialogs.ask(
			{ id: "q1", method: "select", title: "Pick", options: ["x"] },
			{ signal: controller.signal },
		);

		controller.abort();

		expect(await pending).toEqual({ id: "q1", method: "cancel" });
		expect(dialogs.needsInput).toBe(false);
		expect(frames.map((frame) => frame.t)).toEqual(["dialog", "dialog-closed"]);
	});
});
