import { homedir } from "node:os";
import { join } from "node:path";

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { DevTools } from "effect/devtools";

import { Catalog, CatalogLive } from "./catalog/catalog.ts";
import { Engines, EnginesLive } from "./engines/registry.ts";
import { EngineSpecLive, SupervisorLive } from "./engines/supervisor.ts";
import { AgentHome, AgentHomeLive } from "./platform/agent-home.ts";
import { Log, LogLive } from "./platform/log.ts";
import { piVersion, sessionFormatVersion } from "./platform/pi.ts";

/**
 * The process you start. It chooses the agent home once and never again, builds the
 * backend's layers, and hands control to `BunRuntime.runMain` so signals close scopes in
 * reverse order.
 *
 * This is also the only file in the backend that reads the environment. Everything else
 * receives what it needs as a service value, so a test home cannot be mixed with the
 * operator's home by a forgotten argument.
 */

const agentDir = process.env["EPSILON_AGENT_HOME"] ?? join(homedir(), ".pi", "agent");
const userHome = process.env["HOME"] ?? homedir();
const isProduction = process.env["NODE_ENV"] === "production";
const maxRunning = 8;

// pi's MCP loader takes no directory and resolves `getAgentDir()` itself, so the variable
// it reads is published here, once, before anything can load MCP. See docs/pi-sdk.md.
process.env["PI_CODING_AGENT_DIR"] = agentDir;

const homeLayer = AgentHomeLive(agentDir, userHome);

/**
 * One engine, one process: `bun run src/engine/main.ts` in dev. A built binary re-runs
 * itself with `--engine`; the dispatch in this file lands with the packaging step.
 */
const engineSpec = {
	command: isProduction
		? [process.execPath, "--engine"]
		: [process.execPath, "run", new URL("../engine/main.ts", import.meta.url).pathname],
	env: {
		EPSILON_ENGINE: "1",
		HOME: userHome,
		PATH: process.env["PATH"] ?? "",
		PI_CODING_AGENT_DIR: agentDir,
	},
} as const;

const core = LogLive.pipe(Layer.provideMerge(homeLayer), Layer.provideMerge(BunServices.layer));
const catalog = CatalogLive(join(agentDir, ".epsilon", "session-index.sqlite"), {
	formatVersion: sessionFormatVersion,
	piVersion,
	schemaVersion: "1",
}).pipe(Layer.provideMerge(core));
const supervisor = SupervisorLive.pipe(
	Layer.provideMerge(core),
	Layer.provideMerge(EngineSpecLive(engineSpec)),
	Layer.provideMerge(catalog),
);
const engines = EnginesLive({ maxRunning }).pipe(
	Layer.provideMerge(core),
	Layer.provideMerge(catalog),
	Layer.provideMerge(supervisor),
);

const AppLive = Layer.mergeAll(core, catalog, engines);

const program = Effect.gen(function* () {
	const home = yield* AgentHome;
	const log = yield* Log;
	const catalogService = yield* Catalog;
	const engineService = yield* Engines;
	yield* log.write("info", "epsilon started", { agentDir: home.agentDir });
	yield* catalogService.sync([join(home.agentDir, "sessions")]);
	const running = yield* engineService.running;
	yield* log.write("info", "engines ready", { running: running.length });
});

const app = isProduction ? AppLive : Layer.mergeAll(AppLive, DevTools.layer());

BunRuntime.runMain()(Effect.provide(program, app));
