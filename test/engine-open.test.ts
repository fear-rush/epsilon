import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, Exit } from "effect";

import { EngineStartFailed } from "../src/engine/errors.ts";
import { EngineSession } from "../src/engine/session.ts";
import { linearSession } from "./sessions.ts";
import { testPaths } from "./setup.ts";

/**
 * F8a: opening a session acquires pi's runtime first, then starts the lock, the watcher
 * and the extension binding. When that second part fails, the runtime has to be released
 * before the error leaves the engine; otherwise its MCP children outlive the failure with
 * no chat to serve.
 *
 * Nothing in a real start can reject today, so the failure comes from `EngineOpenHooks`
 * — the seam this item asked for. The lock file is the observable: it is taken during the
 * start, and only a released runtime removes it.
 */
describe("EngineSession.open", () => {
	test("a start that fails after the runtime exists releases it", async () => {
		const dir = join(testPaths.scratch, "engine-f8a", "chat");
		mkdirSync(dir, { recursive: true });
		const file = join(dir, "2026-01-01T00-00-00-000Z_s-f8a.jsonl");
		writeFileSync(file, linearSession("s-f8a", dir, 2));
		// Ours, not pi's: the watcher writes `<file>.epsilon-lock` and only `dispose` removes it.
		const lock = `${file}.epsilon-lock`;

		const opened = EngineSession.open(
			{
				cwd: dir,
				file,
				homeDir: testPaths.agentHome,
				place: null,
				sandboxRoot: undefined,
				sessionId: "s-f8a",
				userHome: testPaths.sandboxHome,
			},
			() => undefined,
			() => undefined,
			() => undefined,
			{
				afterStart: Effect.fail(
					new EngineStartFailed({ reason: "the extensions failed to wire", sessionId: "s-f8a" }),
				),
			},
		);
		const exit = await Effect.runPromise(
			Effect.scoped(opened.pipe(Effect.exit)).pipe(
				// oxlint-disable-next-line effecttsgo/strict-effect-provide -- the test entry point builds the runtime
				Effect.provide(BunServices.layer),
			),
		);

		expect(Exit.isFailure(exit)).toBe(true);
		expect(existsSync(lock)).toBe(false);
	}, 20_000);
});
