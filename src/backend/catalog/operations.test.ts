import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import type { FileSystem } from "effect";

import { SessionRunning } from "#protocol/errors";

import { linearSession, writeSession } from "../../../test/sessions.ts";
import { testPaths } from "../../../test/setup.ts";
import { Catalog, CatalogLive } from "./catalog.ts";
import { SessionLocks, makeSessionLocks } from "./locks.ts";
import { Sessions, SessionsLive } from "./operations.ts";

const root = join(testPaths.agentHome, "sessions");
const projectDir = join(root, "--ops-project--");
const otherDir = join(root, "--elsewhere--");
const indexPath = join(testPaths.scratch, "ops", "index.sqlite");
const meta = { formatVersion: 3, piVersion: "1.4.0", schemaVersion: "1" };

const running = new Set(["s-running"]);
const locks = Layer.succeed(SessionLocks, makeSessionLocks(running));
const catalog = Layer.provide(CatalogLive(indexPath, meta), BunServices.layer);
const sessions = Layer.provide(SessionsLive, Layer.mergeAll(catalog, locks, BunServices.layer));

const environment = Layer.mergeAll(sessions, catalog, BunServices.layer);

const run = <A, E>(effect: Effect.Effect<A, E, Catalog | Sessions | FileSystem.FileSystem>) =>
	Effect.runPromise(effect.pipe(Effect.provide(environment)));

describe("session operations", () => {
	test("moving a running chat is refused and the file stays where it is (F1)", async () => {
		rmSync(root, { recursive: true, force: true });
		mkdirSync(projectDir, { recursive: true });
		writeSession(projectDir, "s-running", linearSession("s-running", "/tmp/ops", 3));
		await run(
			Effect.gen(function* () {
				const catalogService = yield* Catalog;
				yield* catalogService.sync([root]);
			}),
		);

		const outcome = await run(
			Effect.gen(function* () {
				const service = yield* Sessions;
				const catalogService = yield* Catalog;
				yield* catalogService.sync([root]);
				return yield* Effect.flip(service.move("s-running", otherDir));
			}),
		);

		expect(outcome).toBeInstanceOf(SessionRunning);
		const files = readdirSync(projectDir).filter((file) => file.endsWith("_s-running.jsonl"));
		expect(files).toHaveLength(1);
		expect(existsSync(join(projectDir, files[0] ?? ""))).toBe(true);
	});

	test("an idle chat moves, and the index follows it", async () => {
		mkdirSync(otherDir, { recursive: true });
		writeSession(projectDir, "s-idle", linearSession("s-idle", "/tmp/ops", 3));
		const moved = await run(
			Effect.gen(function* () {
				const service = yield* Sessions;
				const catalogService = yield* Catalog;
				yield* catalogService.sync([root]);
				return yield* service.move("s-idle", otherDir);
			}),
		);
		expect(moved.path.startsWith(otherDir)).toBe(true);
		expect(readdirSync(otherDir).some((file) => file.endsWith("_s-idle.jsonl"))).toBe(true);
	});

	test("renaming appends a session_info entry, as pi does", async () => {
		const renamed = await run(
			Effect.gen(function* () {
				const service = yield* Sessions;
				const catalogService = yield* Catalog;
				yield* catalogService.sync([root]);
				return yield* service.rename("s-idle", "Moved chat");
			}),
		);
		expect(renamed?.name).toBe("Moved chat");
	});
});
