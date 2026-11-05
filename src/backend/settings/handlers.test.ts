import { describe, expect, test } from "bun:test";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, Fiber, FileSystem, Layer, Option, Stream } from "effect";

import { ProjectNotTrusted } from "#protocol/errors";
import { ConfigRpcs } from "#protocol/settings/epsilon";
import type { McpLive } from "#protocol/settings/mcp";

import { testClient } from "../../../test/rpc.ts";
import { testPaths } from "../../../test/setup.ts";
import { AgentHome, AgentHomeLive } from "../platform/agent-home.ts";
import { JsonDocument, JsonDocumentLive } from "../platform/json-document.ts";
import { LogLive } from "../platform/log.ts";
import { PiConfig, PiConfigLive } from "../platform/pi.ts";
import { ConfigChangesLive } from "./changes.ts";
import { EpsilonSettingsLive } from "./epsilon.ts";
import { GeneralStoreLive } from "./general/store.ts";
import { ConfigHandlersLive } from "./handlers.ts";
import { makeMcpService, McpService } from "./mcp/service.ts";
import { McpStore, McpStoreLive } from "./mcp/store.ts";
import { PackageServiceLive } from "./packages/service.ts";
import { ProjectService, ProjectServiceLive } from "./projects/service.ts";
import { ProvidersServiceLive } from "./providers/service.ts";
import { ProvidersStoreLive } from "./providers/store.ts";
import { ReadinessServiceLive } from "./readiness/service.ts";
import { makeSkillsService, SkillsService } from "./skills/service.ts";
import { ConfigSnapshotServiceLive } from "./snapshot.ts";

/**
 * The settings snapshot and change stream over the RPC group, against a real agent home
 * and the features' real services. The only stand-ins are the live-engine answers, which
 * are empty because no chat is open in this process.
 */

const emptyLive: McpLive = {
	codemode: false,
	resourceTools: [],
	servers: [],
	sessions: 0,
	toolSearch: false,
};

const configLayer = (name: string) => {
	const root = join(testPaths.scratch, `config-${name}`);
	const agentDir = join(root, "agent");
	const userHome = join(root, "home");
	mkdirSync(join(agentDir, ".epsilon"), { recursive: true });
	mkdirSync(userHome, { recursive: true });
	const home = AgentHomeLive(agentDir, userHome);
	const platform = Layer.mergeAll(home, BunServices.layer);
	const log = LogLive.pipe(Layer.provideMerge(platform));
	const json = JsonDocumentLive.pipe(Layer.provideMerge(platform));
	const pi = PiConfigLive.pipe(Layer.provideMerge(home));
	const epsilon = EpsilonSettingsLive.pipe(
		Layer.provideMerge(platform),
		Layer.provideMerge(json),
		Layer.provideMerge(log),
	);
	const providersStore = ProvidersStoreLive.pipe(
		Layer.provideMerge(platform),
		Layer.provideMerge(json),
	);
	const providers = ProvidersServiceLive.pipe(
		Layer.provideMerge(pi),
		Layer.provideMerge(providersStore),
		Layer.provideMerge(log),
	);
	const readiness = ReadinessServiceLive.pipe(
		Layer.provideMerge(pi),
		Layer.provideMerge(providersStore),
	);
	const general = GeneralStoreLive.pipe(
		Layer.provideMerge(platform),
		Layer.provideMerge(pi),
		Layer.provideMerge(json),
	);
	const projects = ProjectServiceLive.pipe(Layer.provideMerge(platform), Layer.provideMerge(pi));
	const mcpStore = McpStoreLive.pipe(Layer.provideMerge(platform), Layer.provideMerge(json));
	const mcp = Layer.effect(
		McpService,
		Effect.gen(function* () {
			const store = yield* McpStore;
			const agentHome = yield* AgentHome;
			const document = yield* JsonDocument;
			const config = yield* PiConfig;
			return makeMcpService({
				builtinEnabled: config.builtinEnabled,
				// SAFETY: this test has no engine, so the seam answers "no chat is open", which is
				// the value the type allows.
				runInFolder: () => Effect.succeed(undefined as { sessionId: string } | undefined),
				document,
				home: agentHome,
				live: () => Effect.succeed(emptyLive),
				settings: config.settings,
				store,
			});
		}),
	).pipe(Layer.provideMerge(mcpStore));
	const packages = PackageServiceLive.pipe(Layer.provideMerge(platform), Layer.provideMerge(pi));
	const skills = Layer.effect(
		SkillsService,
		Effect.gen(function* () {
			const agentHome = yield* AgentHome;
			const config = yield* PiConfig;
			const projectService = yield* ProjectService;
			const fs = yield* FileSystem.FileSystem;
			return makeSkillsService({
				extensionSkills: () => Effect.succeed([]),
				fs,
				home: agentHome,
				skills: (cwd) => config.skills(cwd),
				trusted: (path) => projectService.trusted(path),
			});
		}),
	).pipe(Layer.provideMerge(platform), Layer.provideMerge(pi), Layer.provideMerge(projects));
	const snapshot = ConfigSnapshotServiceLive.pipe(
		Layer.provideMerge(epsilon),
		Layer.provideMerge(general),
		Layer.provideMerge(providers),
		Layer.provideMerge(readiness),
		Layer.provideMerge(mcp),
		Layer.provideMerge(packages),
		Layer.provideMerge(skills),
		Layer.provideMerge(projects),
	);
	const changes = ConfigChangesLive.pipe(Layer.provideMerge(platform), Layer.provideMerge(log));
	return {
		agentDir,
		layer: ConfigHandlersLive.pipe(Layer.provideMerge(snapshot), Layer.provideMerge(changes)),
		root,
	};
};

describe("settings.snapshot", () => {
	test("assembles the features' own answers for the home", async () => {
		const { agentDir, layer } = configLayer("home");
		mkdirSync(join(agentDir, "skills", "greet"), { recursive: true });
		writeFileSync(
			join(agentDir, "skills", "greet", "SKILL.md"),
			"---\nname: greet\ndescription: Say hello\n---\n\nBody\n",
		);
		const pkg = join(agentDir, "local-pkg");
		mkdirSync(pkg, { recursive: true });
		writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "local-pkg" }));
		writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ packages: [pkg] }, null, 2));
		writeFileSync(
			join(agentDir, "mcp.json"),
			JSON.stringify({ mcpServers: { docs: { url: "https://example.test/mcp" } } }, null, 2),
		);

		const snapshot = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(ConfigRpcs, ConfigHandlersLive);
				return yield* client["settings.snapshot"]({ folder: null });
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(snapshot.project).toBeNull();
		expect(snapshot.epsilon.settings.maxRunning).toBeGreaterThan(0);
		expect(snapshot.settings.rows.length).toBeGreaterThan(0);
		expect(snapshot.providers.providers.some((provider) => provider.id === "anthropic")).toBe(true);
		expect(snapshot.mcp.servers.map((server) => server.name)).toContain("docs");
		expect(snapshot.mcpLive.sessions).toBe(0);
		expect(snapshot.packages.packages.map((entry) => entry.source)).toContain(pkg);
		expect(snapshot.skills.skills.map((skill) => skill.name)).toContain("greet");
		expect(snapshot.readiness.ready).toBe(false);
	});

	test("a project must be trusted, and then its status travels with the snapshot", async () => {
		const { agentDir, layer, root } = configLayer("project");
		const project = join(root, "project");
		mkdirSync(join(project, ".pi"), { recursive: true });
		writeFileSync(join(project, ".pi", "mcp.json"), "{}\n");

		const untrusted = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(ConfigRpcs, ConfigHandlersLive);
				return yield* Effect.flip(client["settings.snapshot"]({ folder: project }));
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);
		expect(untrusted).toBeInstanceOf(ProjectNotTrusted);

		writeFileSync(join(agentDir, "trust.json"), JSON.stringify({ [realpathSync(project)]: true }));
		const snapshot = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(ConfigRpcs, ConfigHandlersLive);
				return yield* client["settings.snapshot"]({ folder: project });
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);
		expect(snapshot.folder).toBe(project);
		expect(snapshot.project?.trusted).toBe(true);
	});
});

describe("settings.changes", () => {
	test("a write under the agent home reaches the stream", async () => {
		const { agentDir, layer } = configLayer("changes");
		const change = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(ConfigRpcs, ConfigHandlersLive);
				const fiber = yield* client["settings.changes"]().pipe(Stream.runHead, Effect.forkScoped);
				// Let the watcher and the subscription install before the write.
				yield* Effect.sleep("300 millis");
				writeFileSync(join(agentDir, "settings.json"), "{}\n");
				return yield* Fiber.join(fiber).pipe(Effect.timeout("4 seconds"));
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);
		expect(Option.isSome(change)).toBe(true);
		if (Option.isSome(change)) expect(change.value).toBe("settings");
	}, 10_000);
});
