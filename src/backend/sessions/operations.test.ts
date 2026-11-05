import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import type { FileSystem } from "effect";

import { SessionRunning } from "#protocol/errors";

import { linearSession, writeSession } from "../../../test/sessions.ts";
import { testPaths } from "../../../test/setup.ts";
import { AgentHomeLive } from "../platform/agent-home.ts";
import type { AgentHome } from "../platform/agent-home.ts";
import { JsonDocumentLive } from "../platform/json-document.ts";
import { Catalog, CatalogLive } from "./catalog.ts";
import { SessionLocks, makeSessionLocks } from "./locks.ts";
import { Sessions, SessionsLive } from "./operations.ts";
import { Pins, PinsLive } from "./pins.ts";

const root = join(testPaths.agentHome, "sessions");
const projectDir = join(root, "--ops-project--");
const otherDir = join(root, "--elsewhere--");
const indexPath = join(testPaths.scratch, "ops", "index.sqlite");
const meta = { formatVersion: 3, piVersion: "1.4.0", schemaVersion: "1" };

const running = new Set(["s-running", "s-project-running"]);
const locks = Layer.succeed(SessionLocks, makeSessionLocks(running));
const home = AgentHomeLive(testPaths.agentHome, testPaths.sandboxHome);
const catalog = Layer.provide(CatalogLive(indexPath, meta), BunServices.layer);
const json = Layer.provide(JsonDocumentLive, BunServices.layer);
const pins = Layer.provide(PinsLive, Layer.mergeAll(home, json, BunServices.layer));
const sessions = Layer.provide(
	SessionsLive,
	Layer.mergeAll(catalog, locks, home, pins, BunServices.layer),
);

const environment = Layer.mergeAll(sessions, catalog, home, pins, BunServices.layer);

const run = <A, E>(
	effect: Effect.Effect<A, E, AgentHome | Catalog | Sessions | Pins | FileSystem.FileSystem>,
) => Effect.runPromise(effect.pipe(Effect.provide(environment)));

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
				return yield* Effect.flip(service.moveToProject("s-running", otherDir));
			}),
		);

		expect(outcome).toBeInstanceOf(SessionRunning);
		const files = readdirSync(projectDir).filter((file) => file.endsWith("_s-running.jsonl"));
		expect(files).toHaveLength(1);
		expect(existsSync(join(projectDir, files[0] ?? ""))).toBe(true);
	});

	test("a move is pi's fork: a new session in the folder, and the old file goes", async () => {
		mkdirSync(otherDir, { recursive: true });
		writeSession(projectDir, "s-idle", linearSession("s-idle", "/tmp/ops", 3));
		const outcome = await run(
			Effect.gen(function* () {
				const service = yield* Sessions;
				const catalogService = yield* Catalog;
				yield* catalogService.sync([root]);
				const moved = yield* service.moveToProject("s-idle", otherDir);
				return { moved, row: yield* catalogService.locate(moved.sessionId) };
			}),
		);
		expect(outcome.moved.sessionId).not.toBe("s-idle");
		expect(outcome.row?.cwd).toBe(otherDir);
		// The history lives on in the fork, so the file it came from is not left behind.
		expect(readdirSync(projectDir).some((file) => file.endsWith("_s-idle.jsonl"))).toBe(false);
	});

	test("removing a project refuses every chat when one is running, and deletes none (F1)", async () => {
		const folder = join(root, "--remove-project--");
		const project = join(testPaths.scratch, "remove-project-running");
		mkdirSync(folder, { recursive: true });
		writeSession(folder, "s-project-running", linearSession("s-project-running", project, 2));
		writeSession(folder, "s-project-idle", linearSession("s-project-idle", project, 2));

		const outcome = await run(
			Effect.gen(function* () {
				const service = yield* Sessions;
				return yield* Effect.flip(service.removeProject(project));
			}),
		);

		expect(outcome).toBeInstanceOf(SessionRunning);
		// The idle chat beside it is still pi's: the refusal happens before any file goes.
		const left = readdirSync(folder).filter((file) => file.endsWith(".jsonl"));
		expect(left).toHaveLength(2);
	});

	test("renaming appends a session_info entry, as pi does", async () => {
		writeSession(projectDir, "s-rename", linearSession("s-rename", "/tmp/ops", 3));
		const renamed = await run(
			Effect.gen(function* () {
				const service = yield* Sessions;
				const catalogService = yield* Catalog;
				yield* catalogService.sync([root]);
				return yield* service.rename("s-rename", "Renamed chat");
			}),
		);
		expect(renamed?.name).toBe("Renamed chat");
	});

	test("deleting a chat forgets its pin", async () => {
		const folder = join(root, "--delete-pinned--");
		writeSession(folder, "s-pinned", linearSession("s-pinned", "/tmp/ops", 2));

		const pinnedAfter = await run(
			Effect.gen(function* () {
				const service = yield* Sessions;
				const catalogService = yield* Catalog;
				const pinService = yield* Pins;
				yield* catalogService.sync([root]);
				yield* pinService.set("s-pinned", true);
				yield* service.remove("s-pinned");
				return (yield* pinService.read).ids.has("s-pinned");
			}),
		);

		expect(pinnedAfter).toBe(false);
		expect(readdirSync(folder)).toEqual([]);
	});

	test("a project's removal drops the folder it emptied, and keeps one outside pi's sessions", async () => {
		const project = join(testPaths.scratch, "remove-project-folders");
		const emptied = join(root, "--folder-emptied--");
		// pi resolves a project's `sessionDir` itself, so these files can live off the root.
		const custom = join(testPaths.scratch, "custom-session-dir");
		writeSession(emptied, "s-emptied", linearSession("s-emptied", project, 2));
		writeSession(custom, "s-custom", linearSession("s-custom", project, 2));

		const removed = await run(
			Effect.gen(function* () {
				const service = yield* Sessions;
				const catalogService = yield* Catalog;
				yield* catalogService.sync([root, custom]);
				return yield* service.removeProject(project);
			}),
		);

		expect(removed.removed).toBe(2);
		expect(existsSync(emptied)).toBe(false);
		// A folder the operator configured is theirs: its chats go, the folder stays.
		expect(existsSync(custom)).toBe(true);
		expect(readdirSync(custom)).toEqual([]);
	});
});
