import { Deferred, Effect } from "effect";

import type { DialogAnswer, DialogQuestion } from "#protocol/conversation/extui";
import type { ServerFrame } from "#protocol/conversation/frames";
import { CommandRefused } from "#protocol/errors";

/**
 * The questions an extension asks, and the answers a person gives.
 *
 * A dialog is keyed by its id and lives until it is answered, times out or is aborted.
 * pi's `ExtensionUIContext` methods are Promises; `ui.ts` is where this Effect API meets
 * them. The map is plain state: every mutation happens on the engine's single thread and
 * no `yield` sits between a read and a write.
 */

type Pending = {
	readonly question: DialogQuestion;
	readonly deferred: Deferred.Deferred<DialogAnswer>;
	closed: boolean;
};

/** pi resolves a dialog it could not show with the method's default. */
export const defaultAnswer = (question: DialogQuestion): DialogAnswer => {
	switch (question.kind) {
		case "confirm":
			return { id: question.id, kind: "confirm", confirmed: false };
		case "select":
		case "input":
			return { id: question.id, kind: "cancelled" };
		default: {
			const unreachable: never = question;
			return unreachable;
		}
	}
};

const abortAnswer = (signal: AbortSignal, question: DialogQuestion): Effect.Effect<DialogAnswer> =>
	Effect.callback<DialogAnswer>((resume) => {
		const onAbort = (): void => resume(Effect.succeed(defaultAnswer(question)));
		if (signal.aborted) {
			onAbort();
			return Effect.void;
		}
		signal.addEventListener("abort", onAbort);
		return Effect.sync(() => signal.removeEventListener("abort", onAbort));
	});

export type AskOptions = {
	readonly timeoutMs?: number;
	readonly signal?: AbortSignal;
};

export class Dialogs {
	private readonly pending = new Map<string, Pending>();
	private readonly emit: (frame: ServerFrame) => void;
	private readonly changed: () => void;

	constructor(emit: (frame: ServerFrame) => void, changed: () => void = () => undefined) {
		this.emit = emit;
		this.changed = changed;
	}

	get needsInput(): boolean {
		return this.pending.size > 0;
	}

	/** Send every unanswered question to a tab that just attached. */
	replay(sink: (frame: ServerFrame) => void): void {
		for (const pending of this.pending.values()) {
			sink({ t: "dialog", question: pending.question });
		}
	}

	/**
	 * Ask a person. A timeout or an aborted signal resolves with pi's default and closes
	 * the dialog, so a question that expired is not left on screen.
	 */
	ask(question: DialogQuestion, options: AskOptions = {}): Effect.Effect<DialogAnswer> {
		if (options.signal?.aborted === true) return Effect.succeed(defaultAnswer(question));
		const deferred = Deferred.makeUnsafe<DialogAnswer>();
		this.pending.set(question.id, { closed: false, deferred, question });
		this.emit({ t: "dialog", question });
		this.changed();

		const answered = Deferred.await(deferred);
		const timedOut =
			options.timeoutMs === undefined || options.timeoutMs <= 0
				? Effect.never
				: Effect.sleep(options.timeoutMs).pipe(Effect.as(defaultAnswer(question)));
		const aborted =
			options.signal === undefined ? Effect.never : abortAnswer(options.signal, question);

		return Effect.raceFirst(answered, Effect.raceFirst(timedOut, aborted)).pipe(
			Effect.ensuring(Effect.sync(() => this.close(question.id))),
		);
	}

	/** The page's answer. A question that is no longer pending is refused, not ignored. */
	answer(answer: DialogAnswer): Effect.Effect<void, CommandRefused> {
		const pending = this.pending.get(answer.id);
		if (pending === undefined) {
			return Effect.fail(
				new CommandRefused({ command: "answerDialog", reason: "That dialog is no longer open." }),
			);
		}
		this.complete(pending, answer);
		return Effect.void;
	}

	/** Close every question with its default: the engine is going away. */
	cancelAll(): void {
		for (const pending of Array.from(this.pending.values())) {
			this.complete(pending, defaultAnswer(pending.question));
		}
	}

	private complete(pending: Pending, answer: DialogAnswer): void {
		if (pending.closed) return;
		pending.closed = true;
		this.pending.delete(pending.question.id);
		this.emit({ t: "dialogClosed", id: pending.question.id });
		Deferred.doneUnsafe(pending.deferred, Effect.succeed(answer));
		this.changed();
	}

	private close(id: string): void {
		const pending = this.pending.get(id);
		if (pending === undefined || pending.closed) return;
		this.complete(pending, defaultAnswer(pending.question));
	}
}
