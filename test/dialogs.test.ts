import { expect } from "bun:test";

import { Effect, Fiber, Schema } from "effect";
import { TestClock } from "effect/testing";

import { DialogQuestion } from "#protocol/conversation/extui";
import type { ServerFrame } from "#protocol/conversation/frames";
import { CommandRefused } from "#protocol/errors";

import { Dialogs } from "../src/engine/dialogs.ts";
import { itEffect } from "./effect.ts";

/**
 * The engine side of an extension's question, on the virtual clock.
 *
 * Two behaviours the page depends on: a deadline is a clock time, so a tab that attaches
 * late counts down from pi's deadline rather than from its own arrival, and an answer
 * settles only the kind of question it names.
 */

const make = () => {
	const frames: ServerFrame[] = [];
	return { dialogs: new Dialogs((frame) => frames.push(frame)), frames };
};

const isDialog = (frame: ServerFrame | undefined): frame is Extract<ServerFrame, { t: "dialog" }> =>
	frame?.t === "dialog";

/** The wire carries the question as unknown; the page decodes it, so the test does too. */
const questionOf = (frame: ServerFrame | undefined): DialogQuestion | undefined =>
	isDialog(frame) ? Schema.decodeUnknownSync(DialogQuestion)(frame.question) : undefined;

itEffect("carries one deadline to a late tab, and answers only its own kind", () =>
	Effect.gen(function* () {
		const { dialogs, frames } = make();
		const pending = yield* Effect.forkChild(
			dialogs.ask({ id: "q1", kind: "confirm", title: "Allow?" }, { timeoutMs: 30_000 }),
		);
		yield* Effect.yieldNow;

		const first = questionOf(frames[0]);
		expect(first?.deadlineAt).toBeDefined();

		const replayed: ServerFrame[] = [];
		dialogs.replay((frame) => replayed.push(frame));
		expect(questionOf(replayed[0])?.deadlineAt).toBe(first?.deadlineAt);

		const wrong = yield* Effect.flip(dialogs.answer({ id: "q1", index: 0, kind: "select" }));
		expect(wrong).toBeInstanceOf(CommandRefused);
		expect(dialogs.needsInput).toBe(true);

		yield* dialogs.answer({ confirmed: true, id: "q1", kind: "confirm" });
		expect(yield* Fiber.join(pending)).toEqual({ confirmed: true, id: "q1", kind: "confirm" });
		expect(dialogs.needsInput).toBe(false);
	}),
);

itEffect("an expired question closes itself with pi's default", () =>
	Effect.gen(function* () {
		const { dialogs, frames } = make();
		const pending = yield* Effect.forkChild(
			dialogs.ask({ id: "q1", kind: "input", title: "Name?" }, { timeoutMs: 200 }),
		);
		yield* TestClock.adjust("1 second");

		expect(yield* Fiber.join(pending)).toEqual({ id: "q1", kind: "cancelled" });
		expect(frames.map((frame) => frame.t)).toEqual(["dialog", "dialogClosed"]);
		expect(dialogs.needsInput).toBe(false);
	}),
);

itEffect("an editor question carries pi's prefill and answers with text", () =>
	Effect.gen(function* () {
		const { dialogs, frames } = make();
		const pending = yield* Effect.forkChild(
			dialogs.ask({ id: "e1", kind: "editor", prefill: "line one", title: "Edit" }),
		);
		yield* Effect.yieldNow;
		expect(questionOf(frames[0])).toMatchObject({ kind: "editor", prefill: "line one" });

		yield* dialogs.answer({ id: "e1", kind: "editor", text: "line two" });
		expect(yield* Fiber.join(pending)).toEqual({ id: "e1", kind: "editor", text: "line two" });
	}),
);
