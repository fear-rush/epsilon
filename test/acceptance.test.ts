import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Clock, Effect, Exit, FileSystem, Scope, Schema } from "effect";

import { TreeRow } from "#protocol/conversation/frames";

import { startEngine, type RemoteEngine } from "../src/backend/conversation/engine.ts";
import { makeEngines } from "../src/backend/conversation/registry.ts";
import type { StartInput } from "../src/backend/conversation/supervisor.ts";
import { makeSupervisor } from "../src/backend/conversation/supervisor.ts";
import { makeAgentHome } from "../src/backend/platform/agent-home.ts";
import { skillsCli } from "../src/backend/settings/skill-import/cli.ts";
import { download } from "../src/backend/settings/skill-import/fetch.ts";
import { startStubModel, writeStubModels } from "./e2e/stub-model.ts";
import { fakeSpec } from "./fake-engine.ts";
import { writeSession } from "./sessions.ts";
import { testPaths } from "./setup.ts";
import { until } from "./until.ts";

/**
 * The Phase 0 bugs (`.sandbox/refactor/02-phase0-fixes.md`) as acceptance tests.
 *
 * Each one is the behaviour the new design must produce, not the old patch. The rows whose
 * feature lands later stay `todo` and name their step.
 */

/** Whether a pid exists; `signal 0` asks the OS without touching the process. */
const alive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

const extension = new URL("./fixtures/test-extension.ts", import.meta.url).pathname;

const homeFor = (name: string, mode?: string): { home: string; env: Record<string, string> } => {
	const home = join(testPaths.scratch, `acceptance-${name}`);
	mkdirSync(home, { recursive: true });
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined) env[key] = value;
	}
	env["HOME"] = testPaths.sandboxHome;
	env["PI_CODING_AGENT_DIR"] = home;
	if (mode !== undefined) env["EPSILON_TEST_EXTENSION"] = mode;
	return { env, home };
};

const writeSettings = (home: string, baseUrl: string, withExtension: boolean): void => {
	writeStubModels(home, baseUrl);
	const settings: { defaultModel: string; defaultProvider: string; extensions?: string[] } = {
		defaultModel: "stub-model",
		defaultProvider: "stub",
	};
	if (withExtension) settings.extensions = [extension];
	writeFileSync(join(home, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`);
};

const run = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) =>
	// oxlint-disable-next-line effecttsgo/strict-effect-provide -- the test entry point builds the runtime
	Effect.runPromise(Effect.provide(effect, BunServices.layer));

const startOptions = (
	sessionId: string,
	home: string,
	env: Record<string, string>,
	file: string | undefined,
	cwd: string,
) => ({
	cwd,
	file,
	homeDir: home,
	place: null,
	sessionId,
	spec: {
		command: [process.execPath, "run", new URL("../src/engine/main.ts", import.meta.url).pathname],
		env,
	},
	userHome: testPaths.sandboxHome,
});

const command = (engine: RemoteEngine, text: string) =>
	engine.request((id) => ({ command: { t: "prompt", text }, id, t: "command", tab: "tab" }));

const waitExit = (engine: RemoteEngine) => engine.waitExit;

describe("acceptance", () => {
	test("F2: a rejected session_shutdown costs that chat, not the server", async () => {
		const failing = homeFor("f2-failing", "throw-shutdown");
		const healthy = homeFor("f2-healthy");
		const stub = await startStubModel();
		writeSettings(failing.home, stub.baseUrl, true);
		writeSettings(healthy.home, stub.baseUrl, false);
		const directory = join(testPaths.scratch, "f2-project");
		mkdirSync(directory, { recursive: true });

		try {
			const result = await run(
				Effect.gen(function* () {
					const first = yield* startEngine(
						startOptions("s-f2-failing", failing.home, failing.env, undefined, directory),
					);
					const second = yield* startEngine(
						startOptions("s-f2-healthy", healthy.home, healthy.env, undefined, directory),
					);
					yield* second.attachTab("tab");
					yield* first.stop(2_000);
					yield* command(second, "are you still there");
					yield* second.stop(2_000);
					return { replied: true, exit: yield* waitExit(first) };
				}),
			);
			expect(result.exit.code).toBeDefined();
			expect(result.replied).toBe(true);
		} finally {
			stub.stop();
		}
	}, 20_000);

	test("F3: closing a replaced engine closes the one that replaced it", async () => {
		const home = makeAgentHome(testPaths.agentHome, testPaths.sandboxHome);
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
		const result = await run(
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem;
				const scope = yield* Scope.make();
				const log = { engine: () => ({ write: () => Effect.void }), write: () => Effect.void };
				const supervisor = makeSupervisor({ fs, home, log, spec: fakeSpec() });
				const engines = makeEngines({
					isChatFolder: () => false,
					locate: () => Effect.as(Effect.void, undefined),
					maxRunning: Effect.succeed(4),
					scope,
					supervisor: { start, stop: supervisor.stop },
					trust: (cwd) => Effect.succeed(cwd),
				});
				const lease = yield* engines.attach({
					cwd: "/tmp",
					file: undefined,
					place: null,
					sessionId: "s-old",
					tab: "tab",
				});
				yield* lease.command({ t: "prompt", text: "rekey" });
				const both = (yield* engines.isRunning("s-old")) && (yield* engines.isRunning("s-old-new"));
				yield* engines.close("s-old");
				const neither =
					!(yield* engines.isRunning("s-old")) && !(yield* engines.isRunning("s-old-new"));
				yield* Scope.close(scope, Exit.void);
				return { both, neither };
			}),
		);
		expect(result.both).toBe(true);
		expect(result.neither).toBe(true);
	}, 10_000);

	test("F5: a 50,000-entry chat opens and its tree is one flat list", async () => {
		const { env, home } = homeFor("f5");
		const directory = join(testPaths.scratch, "f5-project");
		const sessionDir = join(home, "sessions", "--f5--");
		mkdirSync(directory, { recursive: true });
		const stub = await startStubModel();
		writeSettings(home, stub.baseUrl, false);
		const file = writeSession(
			sessionDir,
			"s-50k",
			(await import("./sessions.ts")).fiftyThousand("s-50k", directory),
		);
		try {
			const tree = await run(
				Effect.gen(function* () {
					const engine = yield* startEngine(startOptions("s-50k", home, env, file, directory));
					const value = yield* engine.request((id) => ({ id, kind: "tree", t: "query" }));
					yield* engine.stop(2_000);
					return value;
				}),
			);
			const rows = Schema.decodeUnknownSync(Schema.Array(TreeRow))(tree);
			expect(rows.length).toBeGreaterThanOrEqual(50_000);
			expect(rows.some((row) => row.entryId === "e049999")).toBe(true);
			expect(rows.some((row) => row.current)).toBe(true);
		} finally {
			stub.stop();
		}
	}, 30_000);

	test("F6: a prompt accepted while agent_settled is slow answers", async () => {
		const { env, home } = homeFor("f6", "slow-settled");
		const directory = join(testPaths.scratch, "f6-project");
		mkdirSync(directory, { recursive: true });
		const stub = await startStubModel(["first", "second"], { delayMs: 50 });
		writeSettings(home, stub.baseUrl, true);
		try {
			const result = await run(
				Effect.gen(function* () {
					const engine = yield* startEngine(startOptions("s-f6", home, env, undefined, directory));
					yield* engine.attachTab("tab");
					const before = yield* Clock.currentTimeMillis;
					yield* command(engine, "first");
					const acceptedIn = (yield* Clock.currentTimeMillis) - before;
					let accepted = false;
					for (let attempt = 0; attempt < 60 && !accepted; attempt++) {
						const outcome = yield* Effect.exit(command(engine, "second"));
						if (Exit.isSuccess(outcome)) accepted = true;
						else yield* Effect.sleep("50 millis");
					}
					const total = (yield* Clock.currentTimeMillis) - before;
					yield* engine.stop(3_000);
					return { accepted, acceptedIn, total };
				}),
			);
			// The command reply is pi's acceptance, not the end of the run.
			expect(result.acceptedIn).toBeLessThan(1_000);
			expect(result.accepted).toBe(true);
			expect(result.total).toBeLessThan(6_000);
		} finally {
			stub.stop();
		}
	}, 20_000);

	// The release-on-failure is implemented in `EngineSession.open`; a userland extension
	// cannot make `bindExtensions` reject, so this row waits for the wiring-failure seam
	// that the configuration tests add in Step 6.
	test.todo("F8a: a runtime that fails to wire is closed before the error is reported", () => {
		// Step 6. Opening a session is acquireRelease: a failed wire releases the runtime.
	});
});

/**
 * F8e: a timed-out skill import kills the whole process group.
 *
 * The stand-in CLI spawns a grandchild that ignores SIGTERM and records both pids, then
 * waits. A kill that reached only the child would leave the grandchild alive and the test
 * would fail on the pid it recorded, not on a timeout.
 */
test("F8e: a timed-out skill import kills the whole process group", async () => {
	const dir = join(testPaths.scratch, "f8e");
	mkdirSync(dir, { recursive: true });
	const script = [
		`echo $$ > "${join(dir, "leader.pid")}"`,
		`sh -c 'trap "" TERM; echo $$ > "${join(dir, "child.pid")}"; sleep 30' &`,
		"wait",
	].join("\n");
	const failure = await Effect.runPromise(
		Effect.flip(
			skillsCli(
				{ skills: [], source: "owner/repo" },
				{
					command: ["sh", "-c", script],
					cwd: dir,
					env: { PATH: process.env["PATH"] ?? "" },
					timeoutMs: 300,
					userHome: testPaths.sandboxHome,
				},
			),
		),
	);
	expect(failure.reason).toContain("longer than");
	const pidFile = (name: string): number => Number(readFileSync(join(dir, name), "utf8").trim());
	await until(() => !alive(pidFile("leader.pid")) && !alive(pidFile("child.pid")), {
		deadline: 3000,
		what: "both processes of the killed group to be gone",
	});
});

/** F8k: a streamed body stops at the cap even when the server sends no length. */
test("F8k: a skill download stops at the byte cap", async () => {
	const dir = join(testPaths.scratch, "f8k");
	mkdirSync(dir, { recursive: true });
	const target = join(dir, "archive.tar.gz");
	let sent = 0;
	const chunk = new Uint8Array(8 * 1024).fill(1);
	const server = Bun.serve({
		fetch: () =>
			new Response(
				new ReadableStream({
					pull(controller) {
						// No content-length: exactly the case the old arrayBuffer() could not cap.
						if (sent > 10) {
							controller.close();
							return;
						}
						sent += 1;
						controller.enqueue(chunk);
					},
				}),
			),
		port: 0,
	});
	try {
		const failure = await Effect.runPromise(
			Effect.flip(
				download({
					maxBytes: 16 * 1024,
					path: target,
					source: "https://example.test/skill.tar.gz",
					timeoutMs: 5000,
					url: new URL("skill.tar.gz", server.url).toString(),
				}),
			),
		);
		expect(failure.reason).toContain("larger than");
		expect(existsSync(target)).toBe(false);
	} finally {
		await server.stop(true);
	}
}, 10_000);

// F8f is proven in `test/e2e/reconnect.e2e.ts`: a message typed while the server is gone is
// refused in the composer's own words, and the chat delivers the next one after it returns.

/**
 * F8h: a second process signal exits even when a child ignores shutdown.
 *
 * The fixture installs the server's own handler and then waits on a shell that ignores
 * SIGTERM, which is what a hung engine looks like to the first signal. The second signal
 * must end the process with code 1 instead of waiting forever.
 */
test("F8h: a second process signal exits even when a child ignores shutdown", async () => {
	const pidFile = join(testPaths.scratch, "f8h.pid");
	const fixture = new URL("./fixtures/hung-shutdown.ts", import.meta.url).pathname;
	const child = Bun.spawn([process.execPath, fixture, pidFile], {
		stdio: ["ignore", "ignore", "ignore"],
	});
	const shellPid = async (): Promise<number> => Number(await Bun.file(pidFile).text());

	try {
		await until(() => existsSync(pidFile), { what: "the hung child", deadline: 4000 });
		const shell = await shellPid();

		process.kill(child.pid, "SIGTERM");
		// The first signal only counts: the fixture is still waiting on its child.
		await until(() => child.exitCode !== null, {
			deadline: 300,
			what: "the first signal to be survived",
		}).then(
			() => {
				throw new Error("the first signal ended the process");
			},
			() => undefined,
		);

		process.kill(child.pid, "SIGTERM");
		await until(() => child.exitCode !== null, {
			deadline: 4000,
			what: "the second signal to exit the process",
		});
		expect(child.exitCode).toBe(1);
		// The ignored shell is the fixture's engine: it must not outlive the test.
		try {
			process.kill(shell, "SIGKILL");
		} catch {
			// It is already gone.
		}
	} finally {
		if (child.exitCode === null) process.kill(child.pid, "SIGKILL");
	}
}, 10_000);

test.todo("F8m: notices are capped so a looping extension cannot grow the transcript", () => {
	// Step 2. The reducer keeps the newest notices and counts what it dropped.
});
