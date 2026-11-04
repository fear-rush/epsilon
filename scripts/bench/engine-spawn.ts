import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect } from "effect";

import { startEngine } from "../../src/backend/conversation/engine.ts";
import type { EngineSpec } from "../../src/backend/conversation/engine.ts";
import { report } from "./lib.ts";

/** Spawn to `ready` for one engine, on a scratch home that holds no sessions. */
const home = mkdtempSync(join(tmpdir(), "epsilon-bench-spawn-"));
const project = join(home, "project");
mkdirSync(project, { recursive: true });

const env: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
env["HOME"] = home;
env["PI_CODING_AGENT_DIR"] = home;

const spec: EngineSpec = {
	command: [process.execPath, "run", new URL("../../src/engine/main.ts", import.meta.url).pathname],
	env,
};

try {
	const started = performance.now();
	const engine = await Effect.runPromise(
		startEngine({
			cwd: project,
			file: undefined,
			homeDir: home,
			place: null,
			sessionId: "bench",
			spec,
			userHome: home,
		}).pipe(Effect.provide(BunServices.layer)),
	);
	const elapsed = performance.now() - started;
	await Effect.runPromise(engine.stop(2_000).pipe(Effect.provide(BunServices.layer)));
	await report("engine-spawn", "ms", elapsed);
} finally {
	rmSync(home, { force: true, recursive: true });
}
