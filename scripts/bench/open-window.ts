import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Option, Clock, Effect, Stream } from "effect";

import { startEngine } from "../../src/backend/conversation/engine.ts";
import type { EngineSpec } from "../../src/backend/conversation/engine.ts";
import { linearSession } from "../../test/sessions.ts";
import { report } from "./lib.ts";

/**
 * The first window of a 46 MB session: how long the snapshot takes once the engine is
 * ready, and how large the frame is. The engine cuts one tool result at 64 KB, so the
 * frame budget is about the window, not the file.
 */
const maxFrameBytes = 2 * 1024 * 1024;
const bigBytes = 46 * 1024 * 1024;
const home = mkdtempSync(join(tmpdir(), "epsilon-bench-window-"));
const project = join(home, "project");
const sessions = join(home, "sessions", "--bench-window--");
mkdirSync(sessions, { recursive: true });
mkdirSync(project, { recursive: true });

const base = linearSession("bench-window", project, 40);
const big = {
	id: "big-entry",
	message: {
		content: [{ text: "y".repeat(bigBytes), type: "text" }],
		isError: false,
		role: "toolResult",
		toolCallId: "call-big",
		toolName: "bash",
	},
	parentId: "e000039",
	timestamp: "2026-01-01T00:01:00.000Z",
	type: "message",
};
const file = join(sessions, "2026-01-01_bench-window.jsonl");
writeFileSync(file, `${base}${JSON.stringify(big)}\n`);

const env: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
env["HOME"] = home;
env["PI_CODING_AGENT_DIR"] = home;

const spec: EngineSpec = {
	command: [process.execPath, "run", new URL("../../src/engine/main.ts", import.meta.url).pathname],
	env,
};

try {
	const result = await Effect.runPromise(
		Effect.gen(function* () {
			const engine = yield* startEngine({
				cwd: project,
				file,
				homeDir: home,
				place: null,
				sessionId: "bench-window",
				spec,
				userHome: home,
			});
			const started = yield* Clock.currentTimeMillis;
			yield* engine.attachTab("bench");
			const frame = yield* engine.frames("bench").pipe(
				Stream.filter((next) => next.t === "snapshot"),
				Stream.take(1),
				Stream.runHead,
			);
			const elapsed = (yield* Clock.currentTimeMillis) - started;
			yield* engine.stop(2_000);
			return { elapsed, frame };
		}).pipe(Effect.provide(BunServices.layer)),
	);

	if (Option.isNone(result.frame)) throw new Error("the engine sent no snapshot");
	const bytes = JSON.stringify(result.frame.value).length;
	console.log(
		JSON.stringify({
			name: "open-window-frame",
			unit: "KiB",
			value: Math.round(bytes / 1024),
			limit: maxFrameBytes / 1024,
			within: bytes <= maxFrameBytes,
		}),
	);
	if (bytes > maxFrameBytes) process.exit(1);
	await report("open-window", "ms", result.elapsed);
} finally {
	rmSync(home, { force: true, recursive: true });
}
