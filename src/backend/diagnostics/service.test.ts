import { describe, expect } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, FileSystem } from "effect";

import { itEffect } from "../../../test/effect.ts";
import { testPaths } from "../../../test/setup.ts";
import { makeDiagnosticsService } from "./service.ts";

/**
 * The crash list and the running engines, from a real directory.
 *
 * A record the supervisor wrote is the only input that matters; a broken one must not take
 * the page down, because the page is what a person opens when something is already wrong.
 */

const crashes = (name: string) => {
	const dir = join(testPaths.scratch, `diagnostics-${name}`, "crashes");
	mkdirSync(dir, { recursive: true });
	return dir;
};

const record = (time: string, sessionId: string) => ({
	exit: 9,
	lastHeartbeat: { at: 1000, rss: 4096, seq: 3 },
	lastLogLines: ["engine stopped"],
	piVersion: "1.4.0",
	sessionId,
	time,
});

describe("diagnostics", () => {
	itEffect(
		"lists running engines and the crash records newest first",
		() =>
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem;
				const dir = crashes("read");
				writeFileSync(
					join(dir, "old.json"),
					JSON.stringify(record("2026-11-01T00:00:00.000Z", "s-old")),
				);
				writeFileSync(
					join(dir, "new.json"),
					JSON.stringify(record("2026-11-03T00:00:00.000Z", "s-new")),
				);
				writeFileSync(join(dir, "broken.json"), "{ not json");
				const service = makeDiagnosticsService({
					crashesDir: dir,
					fs,
					log: { engine: () => ({ write: () => Effect.void }), write: () => Effect.void },
					running: Effect.succeed([
						{
							busy: true,
							pid: 42,
							rss: 1024,
							sessionId: "s-live",
							tabs: 1,
							unsupported: ["onTerminalInput"],
						},
					]),
				});
				const view = yield* service.read;
				expect(view.engines).toEqual([
					{
						busy: true,
						pid: 42,
						rss: 1024,
						sessionId: "s-live",
						tabs: 1,
						unsupported: ["onTerminalInput"],
					},
				]);
				expect(view.crashes.map((row) => row.sessionId)).toEqual(["s-new", "s-old"]);
				expect(view.crashes[0]?.lastHeartbeat?.rss).toBe(4096);
				expect(view.piVersion.length).toBeGreaterThan(0);
			}).pipe(Effect.provide(BunServices.layer)),
		5000,
	);

	itEffect(
		"a home with no crash yet is an empty list, not a failure",
		() =>
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem;
				const service = makeDiagnosticsService({
					crashesDir: join(testPaths.scratch, "diagnostics-missing", "crashes"),
					fs,
					log: { engine: () => ({ write: () => Effect.void }), write: () => Effect.void },
					running: Effect.succeed([]),
				});
				const view = yield* service.read;
				expect(view.crashes).toEqual([]);
				expect(view.engines).toEqual([]);
			}).pipe(Effect.provide(BunServices.layer)),
		5000,
	);
});
