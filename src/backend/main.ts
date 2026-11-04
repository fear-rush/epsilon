import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { DevTools } from "effect/devtools";
import { FetchHttpClient } from "effect/http";

import { Catalog, CatalogLive } from "./catalog/catalog.ts";
import { ConfigChangesLive } from "./config/changes.ts";
import { GeneralStoreLive } from "./config/general/store.ts";
import { McpRegistryServiceLive } from "./config/mcp-registry/service.ts";
import { McpServiceLive } from "./config/mcp/service.ts";
import { McpStoreLive } from "./config/mcp/store.ts";
import { PackageServiceLive } from "./config/packages/service.ts";
import { ProjectServiceLive } from "./config/projects/service.ts";
import { ProviderLoginServiceLive } from "./config/providers/login.ts";
import { ProvidersServiceLive } from "./config/providers/service.ts";
import { ProvidersStoreLive } from "./config/providers/store.ts";
import { ReadinessServiceLive } from "./config/readiness/service.ts";
import { SkillImportServiceLive } from "./config/skill-import/service.ts";
import { SkillsServiceLive } from "./config/skills/service.ts";
import { ConfigSnapshotServiceLive } from "./config/snapshot.ts";
import { ContextServiceLive } from "./context/service.ts";
import { DiagnosticsServiceLive } from "./diagnostics/service.ts";
import { Engines, EnginesLive } from "./engines/registry.ts";
import { EngineSpecLive, SupervisorLive } from "./engines/supervisor.ts";
import { AgentHome, AgentHomeLive } from "./platform/agent-home.ts";
import { ensureDir } from "./platform/files.ts";
import { JsonDocumentLive } from "./platform/json-document.ts";
import { Log, LogLive } from "./platform/log.ts";
import { PiConfigLive, piVersion, sessionFormatVersion } from "./platform/pi.ts";
import { HOSTNAME, ServeLive } from "./serve.ts";
import { EpsilonSettings, EpsilonSettingsLive } from "./settings.ts";

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
/** The dev script sets this, so a sandboxed server cannot open the operator's disk. */
const projectsRoot = process.env["EPSILON_PROJECTS_ROOT"];
const isProduction = process.env["NODE_ENV"] === "production";

const port = Number.parseInt(process.env["EPSILON_PORT"] ?? "3000", 10);
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
	throw new Error(`EPSILON_PORT must be a port number, got "${process.env["EPSILON_PORT"] ?? ""}"`);
}

/**
 * The launch token. A page this server served is the only place it appears, so a page on
 * another origin cannot send `handshake` correctly. The dev script sets the same value for
 * Vite, so the page Vite serves during development can open the socket (12-gaps.md G3).
 */
const launchToken =
	process.env["EPSILON_TOKEN"] ??
	Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");

/** Vite's origin and proxy target in dev; unset in production and in the e2e specs. */
const devOrigin = process.env["EPSILON_DEV_ORIGIN"];

/** `src/app` beside this file in a checkout, `dist/app` in a build. */
const appDir = new URL("../app", import.meta.url).pathname;

// pi's MCP loader takes no directory and resolves `getAgentDir()` itself, so the variable
// it reads is published here, once, before anything can load MCP. See docs/pi-sdk.md.
process.env["PI_CODING_AGENT_DIR"] = agentDir;

const homeLayer = AgentHomeLive(agentDir, userHome, projectsRoot);

/**
 * One engine, one process.
 *
 * The built backend finds the built engine beside it; a server started from source runs the
 * TypeScript entry. Either way the path is resolved from this file, never from the working
 * directory, so the two builds cannot be mixed.
 */
const builtEngine = new URL("../engine/main.js", import.meta.url).pathname;
const sourceEngine = new URL("../engine/main.ts", import.meta.url).pathname;
const engineEntry = existsSync(builtEngine) ? builtEngine : sourceEngine;
const engineSpec = {
	command: [process.execPath, ...(engineEntry.endsWith(".ts") ? ["run"] : []), engineEntry],
	env: {
		EPSILON_ENGINE: "1",
		HOME: userHome,
		PATH: process.env["PATH"] ?? "",
		PI_CODING_AGENT_DIR: agentDir,
	},
} as const;

const core = Layer.mergeAll(LogLive, JsonDocumentLive, FetchHttpClient.layer).pipe(
	Layer.provideMerge(homeLayer),
	Layer.provideMerge(BunServices.layer),
);
const settings = EpsilonSettingsLive.pipe(Layer.provideMerge(core));
const catalog = CatalogLive(join(agentDir, ".epsilon", "session-index.sqlite"), {
	formatVersion: sessionFormatVersion,
	piVersion,
	schemaVersion: "1",
}).pipe(Layer.provideMerge(core));
const pi = PiConfigLive.pipe(Layer.provideMerge(core));
const projects = ProjectServiceLive.pipe(Layer.provideMerge(core), Layer.provideMerge(pi));
const supervisor = SupervisorLive.pipe(
	Layer.provideMerge(core),
	Layer.provideMerge(EngineSpecLive(engineSpec)),
	Layer.provideMerge(catalog),
);
const engines = EnginesLive.pipe(
	Layer.provideMerge(core),
	Layer.provideMerge(catalog),
	Layer.provideMerge(settings),
	Layer.provideMerge(projects),
	Layer.provideMerge(supervisor),
);

const infra = Layer.mergeAll(core, settings, catalog, pi, projects, engines);

/**
 * Every configuration service the socket answers from, in three stages: what nothing else
 * in the stage needs, what needs only the first, and the two aggregates that read the
 * middle. The layers are named once and reused, so `infra` and every feature below it is
 * built once however many handlers reach it.
 */
const foundation = Layer.mergeAll(
	GeneralStoreLive,
	ProvidersStoreLive,
	ProviderLoginServiceLive,
	McpStoreLive,
	McpRegistryServiceLive,
	PackageServiceLive,
	ConfigChangesLive,
).pipe(Layer.provideMerge(infra));

const middle = Layer.mergeAll(
	ProvidersServiceLive,
	ReadinessServiceLive,
	McpServiceLive,
	SkillsServiceLive,
	SkillImportServiceLive({ HOME: userHome, PATH: process.env["PATH"] ?? "" }),
	DiagnosticsServiceLive,
).pipe(Layer.provideMerge(foundation));

const services = Layer.mergeAll(
	ConfigSnapshotServiceLive.pipe(Layer.provideMerge(middle)),
	ContextServiceLive.pipe(Layer.provideMerge(middle)),
);

/**
 * The session folder is watched for the life of the process: a chat a terminal pi writes
 * appears in the page without a reload, and the index stays a read model of the files.
 */
const watchSessions = Layer.effectDiscard(
	Effect.gen(function* () {
		const catalogService = yield* Catalog;
		const home = yield* AgentHome;
		const root = join(home.agentDir, "sessions");
		yield* ensureDir(root);
		yield* ensureDir(home.chatsDir);
		yield* catalogService.watch([root]);
	}),
).pipe(Layer.provideMerge(infra));

const serve = ServeLive({ appDir, devOrigin, port, token: launchToken });
const AppLive = serve.pipe(Layer.provideMerge(services), Layer.provideMerge(watchSessions));

const program = Effect.gen(function* () {
	const home = yield* AgentHome;
	const log = yield* Log;
	const catalogService = yield* Catalog;
	const engineService = yield* Engines;
	const epsilonSettings = yield* EpsilonSettings;
	const current = yield* epsilonSettings.view;
	yield* log.write("info", "epsilon started", {
		agentDir: home.agentDir,
		maxRunning: current.settings.maxRunning,
	});
	yield* catalogService.sync([join(home.agentDir, "sessions")]);
	const running = yield* engineService.running;
	yield* log.write("info", "engines ready", { running: running.length });
	yield* log.write("info", "epsilon listening", { url: `http://${HOSTNAME}:${port}` });
	// The server lives in the layers; the process lives until a signal interrupts this fiber,
	// which closes them in reverse order.
	return yield* Effect.never;
});

/**
 * A second signal forces the exit.
 *
 * `BunRuntime.runMain` interrupts the main fiber on the first one, and that closes every
 * scope in reverse order. If a finalizer is waiting on an engine that ignores shutdown,
 * the wait would otherwise have no end (F8h).
 */
let signals = 0;
const onSignal = (): void => {
	signals += 1;
	if (signals > 1) process.exit(1);
};
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);

const app = isProduction ? AppLive : Layer.mergeAll(AppLive, DevTools.layer());

BunRuntime.runMain()(Effect.provide(program, app));
