import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, Layer, Schema } from "effect";

import { ProjectRpcs } from "#protocol/config/projects";
import { ProjectRefused } from "#protocol/errors";

import { testClient } from "../../../../test/rpc.ts";
import { testPaths } from "../../../../test/setup.ts";
import { AgentHomeLive } from "../../platform/agent-home.ts";
import { PiConfigLive } from "../../platform/pi.ts";
import { ProjectHandlersLive } from "./handlers.ts";
import { ProjectServiceLive } from "./service.ts";

/**
 * Projects and pi's trust file over the RPC group, against real folders and a real
 * agent home. The store is pi's own `trust.json`; the settings manager is pi's, so a
 * malformed project file is reported by the same reader terminal pi uses.
 */

const projectLayer = (name: string, projectsRoot?: string) => {
	const root = join(testPaths.scratch, `projects-${name}`);
	const agentDir = join(root, "agent");
	const home = join(root, "home");
	mkdirSync(agentDir, { recursive: true });
	mkdirSync(home, { recursive: true });
	const homeLayer = AgentHomeLive(agentDir, home, projectsRoot);
	const platform = Layer.mergeAll(homeLayer, BunServices.layer);
	const pi = PiConfigLive.pipe(Layer.provideMerge(homeLayer));
	const service = ProjectServiceLive.pipe(Layer.provideMerge(platform), Layer.provideMerge(pi));
	return {
		agentDir,
		home,
		layer: ProjectHandlersLive.pipe(Layer.provideMerge(service)),
		root,
	};
};

const gated = (path: string): string => {
	mkdirSync(join(path, ".pi"), { recursive: true });
	writeFileSync(join(path, ".pi", "mcp.json"), "{}\n");
	return path;
};

const writeJson = (path: string, value: Schema.Json): void => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

const readJson = (path: string): Schema.Json =>
	Schema.decodeUnknownSync(Schema.Json)(JSON.parse(readFileSync(path, "utf8")));

describe("config.projects", () => {
	test("an ungated folder is trusted; a gated one asks, and the record is pi's", async () => {
		const { agentDir, home, layer } = projectLayer("trust");
		const plain = join(home, "plain");
		const project = gated(join(home, "project"));
		mkdirSync(plain, { recursive: true });

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(ProjectRpcs, ProjectHandlersLive);
				const plainStatus = yield* client["config.projects.status"]({ path: plain });
				const before = yield* client["config.projects.status"]({ path: project });
				const trusted = yield* client["config.projects.setTrust"]({
					action: "trust",
					path: project,
				});
				const file = readJson(join(agentDir, "trust.json"));
				const untrusted = yield* client["config.projects.setTrust"]({
					action: "untrust",
					path: project,
				});
				const forgotten = yield* client["config.projects.setTrust"]({
					action: "forget",
					path: project,
				});
				return { before, file, forgotten, plainStatus, trusted, untrusted };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.plainStatus.trusted).toBe(true);
		expect(result.plainStatus.hasProjectResources).toBe(false);
		expect(result.plainStatus.parent).toBe(realpathSync(home));
		expect(result.before.trusted).toBe(false);
		expect(result.before.hasProjectResources).toBe(true);
		expect(result.trusted).toMatchObject({ decidedHere: true, trusted: true });
		expect(result.file).toEqual({ [realpathSync(project)]: true });
		expect(result.untrusted.trusted).toBe(false);
		expect(result.forgotten.trusted).toBe(false);
		expect(result.forgotten.decidedHere).toBe(false);
		expect(readJson(join(agentDir, "trust.json"))).toEqual({});
	});

	test("trust-parent covers the folder without a record of its own", async () => {
		const { agentDir, layer, home } = projectLayer("parent");
		const parent = gated(join(home, "parent"));
		const child = gated(join(parent, "child"));

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(ProjectRpcs, ProjectHandlersLive);
				const status = yield* client["config.projects.setTrust"]({
					action: "trust-parent",
					path: child,
				});
				return { parent, status };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.status).toMatchObject({ decidedHere: false, trusted: true });
		const file = readJson(join(agentDir, "trust.json"));
		expect(file).toEqual({ [realpathSync(result.parent)]: true });
	});

	test("defaultProjectTrust decides a gated folder that has no record", async () => {
		const { agentDir, home, layer } = projectLayer("default");
		const project = gated(join(home, "project"));
		writeJson(join(agentDir, "settings.json"), { defaultProjectTrust: "always" });

		const always = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(ProjectRpcs, ProjectHandlersLive);
				return yield* client["config.projects.status"]({ path: project });
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);
		expect(always.trusted).toBe(true);

		writeJson(join(agentDir, "settings.json"), { defaultProjectTrust: "never" });
		const never = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(ProjectRpcs, ProjectHandlersLive);
				return yield* client["config.projects.status"]({ path: project });
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);
		expect(never.trusted).toBe(false);
	});

	test("a bad path is refused before it names the disk", async () => {
		const { agentDir, home, layer } = projectLayer("paths");
		const file = join(home, "file.txt");
		writeFileSync(file, "x");

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(ProjectRpcs, ProjectHandlersLive);
				const relative = yield* Effect.flip(
					client["config.projects.status"]({ path: "relative/folder" }),
				);
				const missing = yield* Effect.flip(
					client["config.projects.status"]({ path: join(home, "missing") }),
				);
				const notFolder = yield* Effect.flip(client["config.projects.status"]({ path: file }));
				const agent = yield* Effect.flip(client["config.projects.status"]({ path: agentDir }));
				return { agent, missing, notFolder, relative };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.relative).toBeInstanceOf(ProjectRefused);
		expect(result.relative.reason).toContain("absolute");
		expect(result.missing.reason).toContain("does not exist");
		expect(result.notFolder.reason).toContain("not a folder");
		expect(result.agent.reason).toContain("agent home");
	});

	test("a sandbox root bounds the picker and the status", async () => {
		const sandboxHome = join(testPaths.scratch, "projects-sandbox", "home");
		const { home, layer, root } = projectLayer("sandbox", sandboxHome);
		const outside = join(root, "outside");
		mkdirSync(outside, { recursive: true });
		const inside = join(home, "inside");
		mkdirSync(inside, { recursive: true });

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(ProjectRpcs, ProjectHandlersLive);
				const listing = yield* client["config.projects.folders"]({});
				const refused = yield* Effect.flip(client["config.projects.status"]({ path: outside }));
				return { listing, refused };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.listing.path).toBe(realpathSync(home));
		expect(result.listing.parent).toBeNull();
		expect(result.listing.folders.map((entry) => entry.name)).toEqual(["inside"]);
		expect(result.refused).toBeInstanceOf(ProjectRefused);
		expect(result.refused.reason).toContain("dev sandbox");
	});

	test("the picker lists folders, hides dot folders, and creates one", async () => {
		const { home, layer } = projectLayer("picker");
		for (const name of ["a", "b", ".hidden"]) mkdirSync(join(home, name), { recursive: true });

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(ProjectRpcs, ProjectHandlersLive);
				const visible = yield* client["config.projects.folders"]({});
				const all = yield* client["config.projects.folders"]({ hidden: true });
				const created = yield* client["config.projects.createFolder"]({
					name: "new",
					parent: home,
				});
				const duplicate = yield* Effect.flip(
					client["config.projects.createFolder"]({ name: "new", parent: home }),
				);
				const separator = yield* Effect.flip(
					client["config.projects.createFolder"]({ name: "a/b", parent: home }),
				);
				return { all, created, duplicate, separator, visible };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.visible.folders.map((entry) => entry.name)).toEqual(["a", "b"]);
		expect(result.all.folders.map((entry) => entry.name)).toEqual([".hidden", "a", "b"]);
		expect(result.created.path).toBe(realpathSync(join(home, "new")));
		expect(result.duplicate.reason).toContain("already exists");
		expect(result.separator.reason).toContain("not a folder name");
	});

	test("a project settings file pi cannot parse is named before trust", async () => {
		const { layer, home } = projectLayer("problems");
		const project = gated(join(home, "project"));
		writeFileSync(join(project, ".pi", "settings.json"), "{ broken");

		const status = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(ProjectRpcs, ProjectHandlersLive);
				return yield* client["config.projects.status"]({ path: project });
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(status.settingsProblems).toHaveLength(1);
		expect(status.settingsProblems?.[0]).toMatchObject({
			path: join(realpathSync(project), ".pi", "settings.json"),
			scope: "project",
		});
	});
});
