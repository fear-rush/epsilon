import { describe, expect, test } from "bun:test";

import { BunServices } from "@effect/platform-bun";
import { Effect, Exit, Ref, Scope } from "effect";
import type { FileSystem } from "effect";

import { ProjectNotTrusted } from "#protocol/errors";

import { fakeSpec } from "../../../test/fake-engine.ts";
import { testPaths } from "../../../test/setup.ts";
import type { RemoteEngine } from "./engine.ts";
import { startEngine } from "./engine.ts";
import { makeEngines } from "./registry.ts";
import type { StartInput } from "./supervisor.ts";

const home = {
	agentDir: testPaths.agentHome,
	epsilonDir: `${testPaths.agentHome}/.epsilon`,
	userHome: testPaths.sandboxHome,
};

const start = (input: StartInput) =>
	startEngine({
		cwd: input.cwd,
		file: input.file,
		homeDir: home.agentDir,
		place: input.place,
		sessionId: input.sessionId,
		spec: fakeSpec(),
		userHome: home.userHome,
	}).pipe(Effect.orDie);

const stop = (engine: RemoteEngine): Effect.Effect<void, never, FileSystem.FileSystem> =>
	engine.stop(1_000);

const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
	Effect.runPromise(effect.pipe(Effect.provide(BunServices.layer)));

const withEngines = <A, E>(
	maxRunning: number,
	body: (engines: ReturnType<typeof makeEngines>) => Effect.Effect<A, E, FileSystem.FileSystem>,
) =>
	Effect.gen(function* () {
		const scope = yield* Scope.make();
		const engines = makeEngines({
			isChatFolder: () => false,
			locate: () => Effect.as(Effect.void, undefined),
			maxRunning: Effect.succeed(maxRunning),
			scope,
			supervisor: { start, stop },
			trust: (cwd) => Effect.succeed(cwd),
		});
		return yield* body(engines).pipe(
			Effect.ensuring(
				Effect.gen(function* () {
					const running = yield* engines.running;
					for (const row of running) yield* engines.close(row.sessionId);
					yield* Scope.close(scope, Exit.void);
				}),
			),
		);
	});

describe("engine registry", () => {
	test("a replacement's new id reaches the same engine (F3)", async () => {
		await run(
			withEngines(4, (engines) =>
				Effect.gen(function* () {
					const lease = yield* engines.attach({
						cwd: "/tmp",
						file: undefined,
						place: null,
						sessionId: "s-old",
						tab: "tab",
					});
					yield* lease.command({ t: "prompt", text: "rekey" });
					expect(yield* engines.isRunning("s-old")).toBe(true);
					expect(yield* engines.isRunning("s-old-new")).toBe(true);
					yield* engines.close("s-old");
					expect(yield* engines.isRunning("s-old")).toBe(false);
					expect(yield* engines.isRunning("s-old-new")).toBe(false);
				}),
			),
		);
	}, 10_000);

	test("an untrusted folder is refused before an engine starts", async () => {
		const result = await run(
			Effect.gen(function* () {
				const scope = yield* Scope.make();
				const engines = makeEngines({
					isChatFolder: () => false,
					locate: () => Effect.as(Effect.void, undefined),
					maxRunning: Effect.succeed(4),
					scope,
					supervisor: { start, stop },
					trust: () => Effect.fail(new ProjectNotTrusted({ path: "/tmp/untrusted" })),
				});
				const outcome = yield* Effect.exit(
					engines.attach({
						cwd: "/tmp/untrusted",
						file: undefined,
						place: null,
						sessionId: "s-untrusted",
						tab: "tab",
					}),
				);
				const running = yield* engines.running;
				yield* Scope.close(scope, Exit.void);
				return { outcome, running };
			}),
		);
		expect(Exit.isFailure(result.outcome)).toBe(true);
		expect(result.running).toEqual([]);
	}, 10_000);

	test("a read-only query reaches every live engine", async () => {
		await run(
			withEngines(4, (engines) =>
				Effect.gen(function* () {
					// Built before the chat exists: the effect must read the entries when it
					// runs, because the MCP panel holds it from before any engine started.
					const query = engines.queryAll("mcpLive");
					yield* engines.attach({
						cwd: "/tmp",
						file: undefined,
						place: null,
						sessionId: "s-query",
						tab: "tab",
					});
					const rows = yield* query;
					expect(rows).toHaveLength(1);
					expect(rows[0]?.sessionId).toBe("s-query");
					expect(rows[0]?.result).toEqual({ kind: "mcpLive" });
				}),
			),
		);
	}, 10_000);

	test("the cap is read at each attach, so a raised one applies without a restart (G2)", async () => {
		await run(
			Effect.gen(function* () {
				const scope = yield* Scope.make();
				const limit = Ref.makeUnsafe(1);
				const engines = makeEngines({
					isChatFolder: () => false,
					locate: () => Effect.as(Effect.void, undefined),
					maxRunning: Ref.get(limit),
					scope,
					supervisor: { start, stop },
					trust: (cwd) => Effect.succeed(cwd),
				});
				const attach = (sessionId: string, tab: string) =>
					engines.attach({ cwd: "/tmp", file: undefined, place: null, sessionId, tab });
				yield* Effect.gen(function* () {
					yield* attach("s-cap-1", "tab-1");
					// One slot: the second chat closes the first.
					yield* attach("s-cap-2", "tab-2");
					expect(yield* engines.isRunning("s-cap-1")).toBe(false);

					// Two slots: the chat already running keeps its process.
					yield* Ref.set(limit, 2);
					yield* attach("s-cap-3", "tab-3");
					expect(yield* engines.isRunning("s-cap-2")).toBe(true);
					expect(yield* engines.isRunning("s-cap-3")).toBe(true);
				}).pipe(
					Effect.ensuring(
						Effect.gen(function* () {
							for (const row of yield* engines.running) yield* engines.close(row.sessionId);
							yield* Scope.close(scope, Exit.void);
						}),
					),
				);
			}),
		);
	}, 10_000);

	test("the cap closes an idle engine before it refuses a new chat (G2)", async () => {
		await run(
			withEngines(1, (engines) =>
				Effect.gen(function* () {
					const first = yield* engines.attach({
						cwd: "/tmp",
						file: undefined,
						place: null,
						sessionId: "s-first",
						tab: "tab-1",
					});
					yield* first.release;
					const second = yield* engines.attach({
						cwd: "/tmp",
						file: undefined,
						place: null,
						sessionId: "s-second",
						tab: "tab-2",
					});
					expect(yield* engines.isRunning("s-first")).toBe(false);
					expect(yield* engines.isRunning("s-second")).toBe(true);
					yield* second.release;
				}),
			),
		);
	}, 10_000);
});
