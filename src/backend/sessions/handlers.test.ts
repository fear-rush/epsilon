import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";

import { SessionNotFound } from "#protocol/errors";
import { SessionsRpcs } from "#protocol/sessions";

import { testClient } from "../../../test/rpc.ts";
import { linearSession, writeSession } from "../../../test/sessions.ts";
import { testPaths } from "../../../test/setup.ts";
import { AgentHomeLive } from "../platform/agent-home.ts";
import { JsonDocumentLive } from "../platform/json-document.ts";
import { PiConfigLive } from "../platform/pi.ts";
import { ProjectServiceLive } from "../settings/projects/service.ts";
import { CatalogLive } from "./catalog.ts";
import { SessionsHandlersLive } from "./handlers.ts";
import { SessionLocksLive } from "./locks.ts";
import { SessionsLive } from "./operations.ts";
import { PinsLive } from "./pins.ts";

/**
 * The list over the RPC group, against real session files and real folders.
 *
 * The one field only the server can answer is `cwdMissing`: pi records the folder a chat
 * ran in, and that folder can be deleted between two opens. The page gates the chat on
 * this answer, so it is checked here through the wire, not on the adapter that reads it.
 */

const meta = { formatVersion: 3, piVersion: "1.4.0", schemaVersion: "1" };

const sandbox = (name: string) => {
	const root = join(testPaths.scratch, `sessions-list-${name}`);
	const agentDir = join(root, "agent");
	mkdirSync(join(agentDir, "sessions", "--tmp-project--"), { recursive: true });
	mkdirSync(join(root, "home"), { recursive: true });
	return { agentDir, root };
};

const handlerLayer = (agentDir: string, root: string) => {
	const home = AgentHomeLive(agentDir, join(root, "home"));
	const platform = Layer.mergeAll(home, BunServices.layer);
	const catalog = CatalogLive(join(agentDir, ".epsilon", "session-index.sqlite"), meta).pipe(
		Layer.provideMerge(platform),
	);
	const json = JsonDocumentLive.pipe(Layer.provideMerge(platform));
	const pi = PiConfigLive.pipe(Layer.provideMerge(platform));
	const projects = ProjectServiceLive.pipe(Layer.provideMerge(platform), Layer.provideMerge(pi));
	const pins = PinsLive.pipe(Layer.provideMerge(platform), Layer.provideMerge(json));
	const sessions = SessionsLive.pipe(
		Layer.provideMerge(platform),
		Layer.provideMerge(catalog),
		Layer.provideMerge(SessionLocksLive),
		Layer.provideMerge(pins),
	);
	return SessionsHandlersLive.pipe(
		Layer.provideMerge(platform),
		Layer.provideMerge(catalog),
		Layer.provideMerge(pins),
		Layer.provideMerge(sessions),
		Layer.provideMerge(projects),
	);
};

describe("sessions.list", () => {
	test("flags the chats whose folder is gone, and only those", async () => {
		const { agentDir, root } = sandbox("missing-folder");
		const present = join(root, "present");
		const gone = join(root, "gone");
		mkdirSync(present, { recursive: true });
		const folder = join(agentDir, "sessions", "--tmp-project--");
		writeSession(folder, "s-here", linearSession("s-here", present, 3));
		writeSession(folder, "s-gone", linearSession("s-gone", gone, 3));

		const layer = handlerLayer(agentDir, root);
		const list = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SessionsRpcs, layer);
				return yield* client["sessions.list"]();
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		const missing = new Map(list.sessions.map((row) => [row.id, row.cwdMissing]));
		expect(missing.get("s-here")).toBe(false);
		expect(missing.get("s-gone")).toBe(true);
	});
});

describe("sessions.removeProject", () => {
	test("deletes a folder's chats together, then has nothing left to delete", async () => {
		const { agentDir, root } = sandbox("remove-project");
		const project = join(root, "project");
		mkdirSync(project, { recursive: true });
		const folder = join(agentDir, "sessions", "--tmp-project--");
		writeSession(folder, "s-remove-a", linearSession("s-remove-a", project, 2));
		writeSession(folder, "s-remove-b", linearSession("s-remove-b", project, 2));

		const layer = handlerLayer(agentDir, root);
		const outcome = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SessionsRpcs, layer);
				const removed = yield* client["sessions.removeProject"]({ directory: project });
				const after = yield* client["sessions.list"]();
				// pi's own route answered 404 once the folder held no chat; the folder is still the
				// only name the page has for it.
				const again = yield* Effect.flip(client["sessions.removeProject"]({ directory: project }));
				return { after, again, removed };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(outcome.removed.removed).toBe(2);
		expect(outcome.after.sessions).toHaveLength(0);
		expect(outcome.again).toBeInstanceOf(SessionNotFound);
	});
});
