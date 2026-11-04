import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

import { BunServices } from "@effect/platform-bun";
import { Effect, Exit, FileSystem, Option, Schema, Stream } from "effect";
import { TestClock } from "effect/testing";

import { EngineCrashLoop } from "#protocol/errors";

import { itEffect } from "../../../test/effect.ts";
import { fakeSpec } from "../../../test/fake-engine.ts";
import { testPaths } from "../../../test/setup.ts";
import { until } from "../../../test/until.ts";
import { startEngine, type RemoteEngine } from "./engine.ts";
import { makeSupervisor } from "./supervisor.ts";

const home = {
	agentDir: testPaths.agentHome,
	chatsDir: `${testPaths.agentHome}/chats`,
	epsilonDir: `${testPaths.agentHome}/.epsilon`,
	userHome: testPaths.sandboxHome,
};

const log = {
	engine: () => ({ write: () => Effect.void }),
	write: () => Effect.void,
};

const startOptions = (sessionId: string, mode: "normal" | "silent" | "crash" = "normal") => ({
	cwd: "/tmp",
	file: undefined,
	homeDir: testPaths.agentHome,
	place: null,
	sessionId,
	spec: fakeSpec(mode),
	userHome: testPaths.sandboxHome,
});

const nextFrame = (engine: RemoteEngine, tab: string, tag: string) =>
	engine.frames(tab).pipe(
		Stream.filter((frame) => frame.t === tag),
		Stream.take(1),
		Stream.runHead,
	);

/** The fields of a crash record this test reads. */
const CrashRecord = Schema.Struct({
	exit: Schema.Finite,
	lastHeartbeat: Schema.NullOr(Schema.Struct({ rss: Schema.Finite })),
	piVersion: Schema.String,
});

/** The crash records the supervisor wrote for one chat, newest last. */
const crashRecords = (sessionId: string): ReadonlyArray<string> => {
	try {
		return readdirSync(`${home.epsilonDir}/crashes`).filter((name) =>
			name.endsWith(`-${sessionId}.json`),
		);
	} catch {
		return [];
	}
};

describe("engine process", () => {
	itEffect(
		"spawns, answers a command and a query, then stops",
		() =>
			Effect.gen(function* () {
				const engine = yield* startEngine(startOptions("s-fake"));
				yield* engine.attachTab("tab-1");
				const reply = yield* engine.request((id) => ({
					command: { t: "prompt", text: "hello" },
					id,
					t: "command",
					tab: "tab-1",
				}));
				expect(reply).toEqual({ disposition: "started" });
				const query = yield* engine.request((id) => ({ id, kind: "tree", t: "query" }));
				expect(query).toEqual({ kind: "tree" });
				const appended = yield* nextFrame(engine, "tab-1", "append");
				expect(Option.isSome(appended)).toBe(true);
				yield* engine.stop(1_000);
			}).pipe(Effect.provide(BunServices.layer)),
		5000,
	);

	test("a crash fails a pending request with EngineStopped", async () => {
		const failed = await Effect.runPromise(
			Effect.gen(function* () {
				const engine = yield* startEngine(startOptions("s-crash"));
				yield* engine.attachTab("tab-1");
				yield* engine.send({
					command: { t: "prompt", text: "crash" },
					id: "never",
					t: "command",
					tab: "tab-1",
				});
				const exit = yield* engine.waitExit;
				expect(exit.code).toBe(9);
				return yield* Effect.exit(engine.request((id) => ({ id, kind: "tree", t: "query" })));
			}).pipe(Effect.provide(BunServices.layer)),
		);
		expect(Exit.isFailure(failed)).toBe(true);
	}, 5000);

	itEffect(
		"the watchdog kills an engine that stops heartbeating (TestClock)",
		() =>
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem;
				const supervisor = makeSupervisor({ fs, home, log, spec: fakeSpec("silent") });
				const engine = yield* supervisor.start({
					cwd: "/tmp",
					file: undefined,
					place: null,
					sessionId: "s-silent",
				});
				yield* TestClock.adjust("31 seconds");
				const exit = yield* engine.waitExit;
				expect(exit.code).toBeDefined();
				expect(engine.isStopping).toBe(false);
			}).pipe(Effect.provide(BunServices.layer)),
		8000,
	);

	itEffect(
		"a chat that crashed three times in a minute is refused, then allowed (TestClock)",
		() =>
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem;
				const sessionId = "s-crash-loop";
				const supervisor = makeSupervisor({ fs, home, log, spec: fakeSpec("normal") });
				const start = () =>
					supervisor.start({ cwd: "/tmp", file: undefined, place: null, sessionId });

				const crashOnce = (expected: number) =>
					Effect.gen(function* () {
						const engine = yield* start();
						yield* engine.attachTab("tab");
						yield* engine.send({
							command: { t: "prompt", text: "crash" },
							id: `crash-${expected}`,
							t: "command",
							tab: "tab",
						});
						yield* engine.waitExit;
						// The record is written after the exit is seen, so its presence is the signal
						// that the streak counted this crash.
						yield* Effect.promise(() =>
							until(() => crashRecords(sessionId).length >= expected, {
								what: `crash record ${expected}`,
							}),
						);
						// A record is named by the millisecond it was written in, so the next crash
						// needs its own; the window is a minute, so three still fit.
						yield* TestClock.adjust("1 second");
					});

				yield* crashOnce(1);
				yield* crashOnce(2);
				yield* crashOnce(3);
				const refused = yield* Effect.flip(start());
				expect(refused).toBeInstanceOf(EngineCrashLoop);

				// The window is a minute: after it, the same chat may start again.
				yield* TestClock.adjust("61 seconds");
				const allowed = yield* start();
				expect(yield* allowed.currentStatus).toBeDefined();
				yield* allowed.stop(1_000);
			}).pipe(Effect.provide(BunServices.layer)),
		20000,
	);

	test("a crash record keeps the last heartbeat and the exit", async () => {
		const sessionId = "s-crash-record";
		await Effect.runPromise(
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem;
				const supervisor = makeSupervisor({ fs, home, log, spec: fakeSpec("normal") });
				const engine = yield* supervisor.start({
					cwd: "/tmp",
					file: undefined,
					place: null,
					sessionId,
				});
				yield* engine.attachTab("tab");
				yield* engine.send({
					command: { t: "prompt", text: "crash" },
					id: "crash",
					t: "command",
					tab: "tab",
				});
				yield* engine.waitExit;
				yield* Effect.promise(() =>
					until(() => crashRecords(sessionId).length > 0, { what: "the crash record" }),
				);
			}).pipe(Effect.provide(BunServices.layer)),
		);
		const [name] = crashRecords(sessionId);
		expect(name).toBeDefined();
		const record = Schema.decodeUnknownSync(CrashRecord)(
			// SAFETY: the supervisor wrote this file in this process, one line of JSON.
			JSON.parse(readFileSync(`${home.epsilonDir}/crashes/${name}`, "utf8")),
		);
		expect(record.exit).toBe(9);
		expect(record.lastHeartbeat?.rss).toBeGreaterThan(0);
		expect(record.piVersion.length).toBeGreaterThan(0);
	}, 8000);

	test("stopping a live engine ends its process", async () => {
		const engine = await Effect.runPromise(
			startEngine(startOptions("s-late")).pipe(Effect.provide(BunServices.layer)),
		);
		await Effect.runPromise(engine.stop(1_000).pipe(Effect.provide(BunServices.layer)));
		expect(engine.currentSessionId).toBe("s-late");
	});
});
