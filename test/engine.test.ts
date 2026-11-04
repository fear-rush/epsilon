import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Clock, Effect, Option, Schema, Stream } from "effect";

import type { Command } from "#protocol/conversation/commands";
import { ExportedSession } from "#protocol/conversation/export";
import type { ServerFrame } from "#protocol/conversation/frames";

import { startEngine } from "../src/backend/conversation/engine.ts";
import type { RemoteEngine } from "../src/backend/conversation/engine.ts";
import { startStubModel, writeStubModels } from "./e2e/stub-model.ts";
import { linearSession, writeSession } from "./sessions.ts";
import { testPaths } from "./setup.ts";

const command = (engine: RemoteEngine, text: string) =>
	engine.request((id) => ({ command: { t: "prompt", text }, id, t: "command", tab: "tab" }));

const frameOf = (engine: RemoteEngine, match: (frame: ServerFrame) => boolean, tab = "tab") =>
	engine.frames(tab).pipe(Stream.filter(match), Stream.take(1), Stream.runHead);

/** One of the chat's own controls, sent the way the page sends it. */
const control = (engine: RemoteEngine, next: Command) =>
	engine.request((id) => ({ command: next, id, t: "command", tab: "tab" }));

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
				const contextLive = yield* engine.request((id) => ({
					id,
					kind: "contextLive",
					t: "query",
				}));
				// No extension registered a provider in this home, so the chain has no answer
				// to offer and the reply keeps the draft it was asked about.
				const autocomplete = yield* engine.request((id) => ({
					cursor: 3,
					id,
					kind: "autocomplete",
					text: "/mo",
					t: "query",
				}));
				// The run controls go through pi: a new tab's opening frames are the answer it
				// wrote. Read them once: a stream that stops mid-chunk drops the frames it
				// pulled and did not use, so one filtered read per frame can lose the next.
				yield* control(engine, { t: "setLabel", label: "Renamed" });
				yield* control(engine, { t: "setAutoCompaction", enabled: false });
				yield* control(engine, { t: "setAutoRetry", enabled: false });
				yield* control(engine, { t: "setHideThinking", hidden: true });
				yield* control(engine, { t: "setCodingTools", enabled: false });
				yield* control(engine, { t: "clearQueue" });
				// pi writes its own export into a scratch folder the engine reads and removes;
				// the rename above is the name the download gets.
				const exported = yield* engine.request((id) => ({
					format: "html",
					id,
					kind: "export",
					t: "query",
				}));
				yield* engine.attachTab("tab2");
				const opening = [...(yield* engine.frames("tab2").pipe(Stream.take(5), Stream.runCollect))];
				const meta = opening.find((frame) => frame.t === "sessionMeta");
				const queue = opening.find((frame) => frame.t === "queue");
				const readings = opening.find((frame) => frame.t === "readings");
				// A shell command runs outside a turn; its frames reach every open tab. The
				// read stops at the frame that ends the run, after the frame that started it.
				yield* engine.attachTab("tab3");
				yield* control(engine, { t: "bash", text: "echo hello-bash" });
				let seenRun = false;
				const bashFrames: ReadonlyArray<ServerFrame> = [
					...(yield* engine.frames("tab3").pipe(
						Stream.takeUntil((frame) => {
							if (frame.t !== "bash") return false;
							if (frame.running) seenRun = true;
							return seenRun && !frame.running;
						}),
						Stream.runCollect,
					)),
				];
				let bash: Extract<ServerFrame, { t: "bash" }> | undefined;
				for (const frame of bashFrames) {
					if (frame.t === "bash" && frame.running) bash = frame;
				}
				yield* engine.stop(5_000);
				return {
					acceptedIn,
					append,
					autocomplete,
					contextLive,
					exported,
					extensionSkills,
					live,
					bash,
					meta,
					queue,
					readings,
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
		if (result.meta === undefined) throw new Error("no session meta");
		expect(result.meta.title).toBe("Renamed");
		expect(result.meta.autoCompaction).toBe(false);
		expect(result.meta.autoRetry).toBe(false);
		expect(result.meta.hideThinking).toBe(true);
		expect(result.meta.codingTools).toBe(false);
		expect(Array.isArray(result.meta.thinkingLevels)).toBe(true);
		// `/` offers pi's built-in table first, in its own order, with its sentences.
		expect(result.meta.commands?.slice(0, 2)).toEqual([
			{ description: "Open settings menu", name: "settings", source: "builtin" },
			{
				argumentHint: "<provider/model>",
				description: "Select model (opens selector UI)",
				name: "model",
				source: "builtin",
			},
		]);
		expect(result.meta.commands?.some((offer) => offer.name === "compact")).toBe(true);
		expect(result.autocomplete).toEqual({ items: [], prefix: "", text: "/mo" });
		if (result.queue === undefined) throw new Error("no queue frame");
		expect(result.queue).toEqual({ followUp: [], steering: [], t: "queue" });
		if (result.readings === undefined) throw new Error("no readings frame");
		// The composer's meter reads pi's own totals, which count the turn the stub answered.
		expect(result.readings.stats.totalMessages).toBeGreaterThan(0);
		expect(typeof result.readings.stats.tokens.total).toBe("number");
		if (result.bash === undefined) throw new Error("no running bash frame");
		expect(result.bash.command).toBe("echo hello-bash");
		expect(result.bash.output).toBe("hello-bash\n");
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
		const exported = Schema.decodeUnknownSync(ExportedSession)(result.exported);
		expect(exported.filename).toBe("Renamed.html");
		expect(exported.mimeType).toBe("text/html;charset=utf-8");
		// pi's HTML carries the JSONL, base64-encoded in its session-data script.
		const data = /<script id="session-data" type="application\/json">([^<]+)<\/script>/.exec(
			exported.text,
		)?.[1];
		if (data === undefined) throw new Error("the export carries no session data");
		expect(Buffer.from(data, "base64").toString("utf8")).toContain("hello there");
		expect(result.contextLive).toMatchObject({
			sessionId: "s-real",
			systemPrompt: expect.any(String),
			tools: { active: expect.any(Array), all: expect.any(Array) },
		});
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

/** A 1×1 PNG: the smallest real image pi can read, used to prove the prompt's images. */
const TINY_PNG =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("a prompt's image reaches pi and comes back in the window", async () => {
	const home = testPaths.agentHome;
	const project = join(testPaths.scratch, "engine-image");
	mkdirSync(project, { recursive: true });
	const stub = await startStubModel(["stub reply"]);
	writeStubModels(home, stub.baseUrl);
	writeFileSync(
		join(home, "settings.json"),
		`${JSON.stringify({ defaultModel: "stub-model", defaultProvider: "stub" }, null, 2)}\n`,
	);
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
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
					sessionId: "s-image",
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
				yield* frameOf(engine, (frame) => frame.t === "snapshot");
				yield* control(engine, {
					images: [{ data: TINY_PNG, mimeType: "image/png", type: "image" }],
					t: "prompt",
					text: "look at this",
				});
				const append = yield* frameOf(
					engine,
					(frame) => frame.t === "append" && frame.entry.role === "user",
				);
				yield* engine.stop(2_000);
				return append;
				// oxlint-disable-next-line effecttsgo/strict-effect-provide -- the test entry point builds the runtime
			}).pipe(Effect.provide(BunServices.layer)),
		);
		if (Option.isNone(result)) throw new Error("the user entry was never appended");
		if (result.value.t !== "append") throw new Error("not an append");
		const entry = result.value.entry;
		if (entry.role !== "user") throw new Error("not a user entry");
		expect(entry.text).toBe("look at this");
		// pi hands the model the image after its own processing, so the bytes may be
		// re-encoded; the window is what proves the image survived the wire.
		expect(entry.images).toHaveLength(1);
		expect(entry.images[0]?.mimeType).toBe("image/png");
		expect(entry.images[0]?.data.length).toBeGreaterThan(0);
	} finally {
		stub.stop();
	}
}, 20_000);

test("built-in commands are answered here, never by the model", async () => {
	const home = testPaths.agentHome;
	const project = join(testPaths.scratch, "engine-builtins");
	const sessions = join(testPaths.scratch, "engine-builtin-sessions");
	mkdirSync(project, { recursive: true });
	const file = writeSession(sessions, "s-builtin", linearSession("s-builtin", project, 12));
	const imported = writeSession(sessions, "s-imported", linearSession("s-imported", project, 3));
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
				sessionId: "s-builtin",
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
			yield* frameOf(engine, (frame) => frame.t === "snapshot");
			// The bundled permission extension reports its mode as a keyed status; a tab
			// that attaches later reads it from the snapshot's frames.
			const defaultMode = yield* frameOf(
				engine,
				(frame) => frame.t === "statuses" && frame.statuses.some((s) => s.text === "perm:ask"),
			);
			// A browser-surface name is answered with pi's own refusal, and the transcript
			// does not grow: nothing was sent to the model.
			yield* control(engine, { t: "prompt", text: "/model" });
			const notice = yield* frameOf(
				engine,
				(frame) => frame.t === "notice" && frame.text.includes("/model"),
			);
			const history = yield* engine.request((id) => ({ id, kind: "history", t: "query" }));
			// A pi-surface name runs pi's operation on the host.
			yield* control(engine, { t: "prompt", text: "/name Renamed here" });
			const named = yield* frameOf(
				engine,
				(frame) => frame.t === "sessionMeta" && frame.title === "Renamed here",
			);
			yield* control(engine, { t: "prompt", text: `/import ${JSON.stringify(imported)}` });
			const afterImport = yield* frameOf(
				engine,
				(frame) => frame.t === "sessionMeta" && frame.sessionId === "s-imported",
			);
			yield* control(engine, { t: "prompt", text: "/new" });
			const afterNew = yield* frameOf(
				engine,
				(frame) => frame.t === "sessionMeta" && frame.sessionId !== "s-imported",
			);
			// An extension command switches the mode, and the new status reaches every tab.
			yield* control(engine, { t: "prompt", text: "/permission yolo" });
			const yolo = yield* frameOf(
				engine,
				(frame) => frame.t === "statuses" && frame.statuses.some((s) => s.text === "perm:yolo"),
			);
			yield* engine.stop(2_000);
			return { afterImport, afterNew, defaultMode, history, named, notice, yolo };
			// oxlint-disable-next-line effecttsgo/strict-effect-provide -- the test entry point builds the runtime
		}).pipe(Effect.provide(BunServices.layer)),
	);

	if (Option.isNone(result.notice)) throw new Error("no notice for /model");
	if (result.notice.value.t !== "notice") throw new Error("not a notice");
	expect(result.notice.value.text).toBe(
		"/model is answered by Epsilon's own interface, not by this engine. Nothing was sent to the model.",
	);
	if (result.history === undefined) throw new Error("no history answer");
	if (typeof result.history !== "object" || result.history === null) {
		throw new Error("the history answer is not a window");
	}
	if (!("entries" in result.history)) throw new Error("the window has no entries");
	expect(result.history.entries).toHaveLength(12);
	expect(Option.isSome(result.named)).toBe(true);
	expect(Option.isSome(result.afterImport)).toBe(true);
	expect(Option.isSome(result.afterNew)).toBe(true);
	expect(Option.isSome(result.defaultMode)).toBe(true);
	expect(Option.isSome(result.yolo)).toBe(true);
}, 20_000);
