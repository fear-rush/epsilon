import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Clock, Effect, Option, Stream } from "effect";

import type { ServerFrame } from "#protocol/conversation/frames";

import { startEngine } from "../src/backend/engines/engine.ts";
import type { RemoteEngine } from "../src/backend/engines/engine.ts";
import { startStubModel, writeStubModels } from "./e2e/stub-model.ts";
import { linearSession, writeSession } from "./sessions.ts";
import { testPaths } from "./setup.ts";

const command = (engine: RemoteEngine, text: string) =>
	engine.request((id) => ({ command: { t: "prompt", text }, id, t: "command", tab: "tab" }));

const frameOf = (engine: RemoteEngine, match: (frame: ServerFrame) => boolean) =>
	engine.frames("tab").pipe(Stream.filter(match), Stream.take(1), Stream.runHead);

test("a session that already has entries opens with a window of them", async () => {
	const home = testPaths.agentHome;
	const project = join(testPaths.scratch, "engine-window");
	const sessions = join(testPaths.scratch, "engine-window-sessions");
	mkdirSync(project, { recursive: true });
	const file = writeSession(sessions, "s-window", linearSession("s-window", project, 40));
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
	env["HOME"] = testPaths.sandboxHome;
	env["PI_CODING_AGENT_DIR"] = home;
	const result = await Effect.runPromise(
		Effect.gen(function* () {
			const engine = yield* startEngine({
				cwd: project,
				file,
				homeDir: home,
				place: null,
				sessionId: "s-window",
				spec: {
					command: [
						process.execPath,
						"run",
						new URL("../src/engine/main.ts", import.meta.url).pathname,
					],
					env,
				},
				userHome: testPaths.sandboxHome,
			});
			yield* engine.attachTab("tab");
			const snapshot = yield* engine.frames("tab").pipe(
				Stream.filter((frame) => frame.t === "snapshot"),
				Stream.take(1),
				Stream.runHead,
			);
			yield* engine.stop(2_000);
			return snapshot;
			// oxlint-disable-next-line effecttsgo/strict-effect-provide -- the test entry point builds the runtime
		}).pipe(Effect.provide(BunServices.layer)),
	);
	if (Option.isNone(result)) throw new Error("no snapshot");
	expect(result.value.entries).toHaveLength(40);
});

test("a real engine opens a chat, streams a turn and answers its tree", async () => {
	const home = testPaths.agentHome;
	const project = join(testPaths.scratch, "real-engine");
	mkdirSync(project, { recursive: true });
	const stub = await startStubModel(["stub reply"], { delayMs: 300 });
	writeStubModels(home, stub.baseUrl);
	writeFileSync(
		join(home, "settings.json"),
		`${JSON.stringify({ defaultModel: "stub-model", defaultProvider: "stub" }, null, 2)}\n`,
	);

	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined) env[key] = value;
	}
	env["HOME"] = testPaths.sandboxHome;
	env["PI_CODING_AGENT_DIR"] = home;

	try {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const engine = yield* startEngine({
					cwd: project,
					file: undefined,
					homeDir: home,
					place: null,
					sessionId: "s-real",
					spec: {
						command: [
							process.execPath,
							"run",
							new URL("../src/engine/main.ts", import.meta.url).pathname,
						],
						env,
					},
					userHome: testPaths.sandboxHome,
				});
				yield* engine.attachTab("tab");
				const snapshot = yield* frameOf(engine, (frame) => frame.t === "snapshot");
				if (Option.isNone(snapshot)) throw new Error("no snapshot");
				if (snapshot.value.t !== "snapshot") throw new Error("not a snapshot");
				const before = yield* Clock.currentTimeMillis;
				yield* command(engine, "hello there");
				const acceptedIn = (yield* Clock.currentTimeMillis) - before;
				const append = yield* frameOf(
					engine,
					(frame) => frame.t === "append" && frame.entry.role === "assistant",
				);
				const tree = yield* engine.request((id) => ({ id, kind: "tree", t: "query" }));
				const transcript = yield* engine.request((id) => ({ id, kind: "history", t: "query" }));
				const live = yield* engine.request((id) => ({ id, kind: "mcpLive", t: "query" }));
				const extensionSkills = yield* engine.request((id) => ({
					id,
					kind: "extensionSkills",
					t: "query",
				}));
				yield* engine.stop(5_000);
				return {
					acceptedIn,
					append,
					extensionSkills,
					live,
					snapshot: snapshot.value,
					transcript,
					tree,
				};
				// oxlint-disable-next-line effecttsgo/strict-effect-provide -- the test entry point builds the runtime
			}).pipe(Effect.provide(BunServices.layer)),
		);

		if (Option.isNone(result.append)) throw new Error("the assistant reply was never appended");
		if (result.append.value.t !== "append") throw new Error("not an append");
		expect(result.snapshot.entries).toHaveLength(0);
		expect(result.acceptedIn).toBeLessThan(2_000);
		const entry = result.append.value.entry;
		expect(entry.role).toBe("assistant");
		if (entry.role === "assistant") {
			expect(
				entry.blocks.some((block) => block.type === "text" && block.text.includes("stub reply")),
			).toBe(true);
		}
		expect(Array.isArray(result.tree)).toBe(true);
		expect(result.transcript).toEqual(expect.objectContaining({ entries: expect.any(Array) }));
		expect(result.extensionSkills).toEqual({ skills: [] });
		// A home with no MCP servers still answers the query: the shape is what a panel reads.
		expect(result.live).toEqual({
			active: expect.any(Array),
			attention: [],
			registered: [],
			resourceTools: [],
			tools: [],
		});
	} finally {
		stub.stop();
	}
}, 20_000);
