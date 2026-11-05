import { BunServices } from "@effect/platform-bun";
import { Deferred, Effect, Option, Queue, Schema } from "effect";

import { SupervisorToEngine } from "#protocol/engine-ipc";
import type { EngineToSupervisor } from "#protocol/engine-ipc";

import { EngineSession } from "./session.ts";
import type { EngineLogLevel, LogFields } from "./session.ts";

/**
 * The engine process: one pi runtime, one chat, one IPC channel.
 *
 * This file is the process entry, so it is where ambient time, environment and signals
 * are allowed (AGENTS.md, invariant 8). Everything it receives is decoded against the
 * protocol in `src/protocol/engine-ipc.ts`; a malformed parent message is a bug in the
 * supervisor, logged and ignored rather than guessed at.
 */

const decodeSupervisor = Schema.decodeUnknownOption(SupervisorToEngine);

const send = (message: EngineToSupervisor): void => {
	process.send?.(message);
};

const log = (level: EngineLogLevel, message: string, fields?: LogFields): void => {
	send(fields === undefined ? { level, message, t: "log" } : { fields, level, message, t: "log" });
};

const describe = (cause: unknown): string => {
	if (cause instanceof Error) return cause.message;
	return String(cause);
};

/** Bash tools run detached, so their groups are not reached by killing the engine's. */
const childPids = (): number[] => {
	const listing = Bun.spawnSync(["ps", "-o", "pid=,ppid=", "-A"], { stdout: "pipe" });
	const pids: number[] = [];
	for (const line of listing.stdout.toString().split("\n")) {
		const [pid, parent] = line.trim().split(/\s+/);
		if (pid === undefined || parent === undefined) continue;
		if (Number(parent) === process.pid) pids.push(Number(pid));
	}
	return pids;
};

const messages: Queue.Queue<SupervisorToEngine> = Effect.runSync(Queue.unbounded());
let current: EngineSession | undefined;
let stop: Deferred.Deferred<void> | undefined;

const shutdownNow = (): void => {
	if (stop !== undefined) Deferred.doneUnsafe(stop, Effect.void);
};

const fatal = (cause: unknown): void => {
	const error = cause instanceof Error ? cause : new Error(String(cause));
	send({ message: error.message, stack: error.stack, t: "fatal" });
	log("error", "engine crashed", { message: error.message });
	const dispose = current?.dispose() ?? Effect.void;
	void Effect.runPromise(
		dispose.pipe(
			Effect.timeout("3 seconds"),
			Effect.orElseSucceed(() => undefined),
			Effect.andThen(Effect.sync(() => process.exit(70))),
		),
	);
};

process.on("uncaughtException", (error: unknown) => {
	fatal(error);
});
process.on("unhandledRejection", (reason: unknown) => {
	fatal(reason);
});
process.on("disconnect", () => {
	// The parent died, including a `bun --watch` restart. No engine outlives epsilon.
	shutdownNow();
});
process.on("message", (raw: unknown) => {
	const decoded = decodeSupervisor(raw);
	if (Option.isNone(decoded)) {
		log("warn", "ignored a malformed supervisor message");
		return;
	}
	Queue.offerUnsafe(messages, decoded.value);
});

let lastTick = Date.now();
setInterval(() => {
	const now = Date.now();
	const lag = Math.max(0, now - lastTick - 1000);
	lastTick = now;
	const usage = process.memoryUsage();
	send({
		childPids: current?.isBusy === true ? childPids() : [],
		heapUsed: usage.heapUsed,
		loopLagMs: lag,
		rss: usage.rss,
		seq: Math.floor(now / 1000),
		t: "heartbeat",
	});
}, 1000);
const reply = (id: string, value: unknown): void => {
	send({ id, ok: true, t: "reply", value });
};

const refuse = (id: string, error: string): void => {
	send({ error, id, ok: false, t: "reply" });
};

const handle = (message: SupervisorToEngine) => {
	switch (message.t) {
		case "init":
			if (current !== undefined) {
				log("warn", "ignored a second init", { sessionId: message.sessionId });
				return Effect.void;
			}
			return Effect.gen(function* () {
				const session = yield* EngineSession.open(
					{
						cwd: message.cwd,
						file: message.file ?? undefined,
						homeDir: message.homeDir,
						place: message.place,
						sandboxRoot: message.sandboxRoot,
						sessionId: message.sessionId,
						userHome: message.userHome,
					},
					send,
					log,
					shutdownNow,
				);
				current = session;
				send({ sessionId: session.sessionId, t: "ready" });
			}).pipe(
				Effect.catchTag("EngineStartFailed", (error) =>
					Effect.sync(() => {
						send({ message: error.reason, t: "fatal" });
						log("error", "the runtime could not be built", { reason: error.reason });
						process.exit(1);
					}),
				),
			);
		case "subscribe":
			return Effect.sync(() => {
				if (current === undefined) {
					log("warn", "a tab subscribed before the session existed", { tab: message.tab });
					return;
				}
				current.subscribeTab(message.tab);
			});
		case "unsubscribe":
			return Effect.sync(() => current?.unsubscribeTab(message.tab));
		case "editor":
			return Effect.sync(() => current?.setEditorText(message.tab, message.text));
		case "answer":
			return Effect.gen(function* () {
				const session = current;
				if (session === undefined) {
					log("warn", "a dialog answer arrived before the session existed");
					return;
				}
				yield* session
					.answer(message.answer)
					.pipe(
						Effect.catchTag("CommandRefused", (error) =>
							Effect.sync(() => log("warn", "dialog answer refused", { reason: error.reason })),
						),
					);
			});
		case "command":
			return Effect.gen(function* () {
				const session = current;
				if (session === undefined) {
					refuse(message.id, "This chat's engine is not ready.");
					return;
				}
				yield* session.command(message.tab, message.command).pipe(
					Effect.matchEffect({
						onFailure: (error) => Effect.sync(() => refuse(message.id, error.reason)),
						onSuccess: () => Effect.sync(() => reply(message.id, undefined)),
					}),
				);
			});
		case "query":
			return Effect.gen(function* () {
				const session = current;
				if (session === undefined) {
					refuse(message.id, "This chat's engine is not ready.");
					return;
				}
				yield* session
					.query({
						before: message.before,
						cursor: message.cursor,
						format: message.format,
						kind: message.kind,
						text: message.text,
					})
					.pipe(
						Effect.matchEffect({
							onFailure: (error) => Effect.sync(() => refuse(message.id, error.reason)),
							onSuccess: (value) => Effect.sync(() => reply(message.id, value)),
						}),
					);
			});
		case "shutdown":
			return Effect.gen(function* () {
				const session = current;
				if (session !== undefined) {
					yield* session.dispose().pipe(
						Effect.timeout(`${message.deadlineMs} millis`),
						Effect.orElseSucceed(() => undefined),
					);
				}
				shutdownNow();
			});
		default:
			return Effect.void;
	}
};

const program = Effect.gen(function* () {
	stop = yield* Deferred.make<void>();
	const consumer = Effect.gen(function* () {
		for (;;) {
			const message = yield* Queue.take(messages);
			yield* handle(message);
		}
	});
	yield* Effect.raceFirst(consumer, Deferred.await(stop));
	const session = current;
	if (session !== undefined) {
		yield* session.dispose().pipe(
			Effect.timeout("3 seconds"),
			Effect.orElseSucceed(() => undefined),
		);
	}
});

// oxlint-disable-next-line effecttsgo/strict-effect-provide -- the engine entry point composes its one layer here
Effect.runPromise(program.pipe(Effect.scoped, Effect.provide(BunServices.layer))).then(
	() => process.exit(0),
	(cause: unknown) => {
		log("error", "the engine program failed", { reason: describe(cause) });
		process.exit(1);
	},
);
