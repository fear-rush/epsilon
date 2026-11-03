import { homedir } from "node:os";
import { join } from "node:path";

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { DevTools } from "effect/devtools";

import { AgentHome, AgentHomeLive } from "./platform/agent-home.ts";
import { JsonDocumentLive } from "./platform/json-document.ts";
import { Log, LogLive } from "./platform/log.ts";

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

// pi's MCP loader takes no directory and resolves `getAgentDir()` itself, so the variable
// it reads is published here, once, before anything can load MCP. See docs/pi-sdk.md.
process.env["PI_CODING_AGENT_DIR"] = agentDir;

const homeLayer = AgentHomeLive(agentDir, userHome);
const AppLive = Layer.mergeAll(LogLive, JsonDocumentLive).pipe(
	Layer.provideMerge(homeLayer),
	Layer.provideMerge(BunServices.layer),
);

const program = Effect.gen(function* () {
	const home = yield* AgentHome;
	const log = yield* Log;
	yield* log.write("info", "epsilon started", { agentDir: home.agentDir });
});

const withDevTools = isProduction
	? (effect: Effect.Effect<void>) => effect
	: Effect.provide(DevTools.layer());

BunRuntime.runMain()(withDevTools(program.pipe(Effect.provide(AppLive))));
