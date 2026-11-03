import { describe, expect, test } from "bun:test";

import { BunServices } from "@effect/platform-bun";
import { Effect, Exit, FileSystem, Option, Stream } from "effect";
import { TestClock } from "effect/testing";

import { itEffect } from "../../../test/effect.ts";
import { fakeSpec } from "../../../test/fake-engine.ts";
import { testPaths } from "../../../test/setup.ts";
import { startEngine, type RemoteEngine } from "./engine.ts";
import { makeSupervisor } from "./supervisor.ts";

const home = {
	agentDir: testPaths.agentHome,
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

	test("stopping a live engine ends its process", async () => {
		const engine = await Effect.runPromise(
			startEngine(startOptions("s-late")).pipe(Effect.provide(BunServices.layer)),
		);
		await Effect.runPromise(engine.stop(1_000).pipe(Effect.provide(BunServices.layer)));
		expect(engine.currentSessionId).toBe("s-late");
	});
});
