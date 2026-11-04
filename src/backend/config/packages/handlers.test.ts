import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { Effect, Layer, Schema } from "effect";

import { PackageRpcs } from "#protocol/config/packages";
import { PackageFailed } from "#protocol/errors";

import { testClient } from "../../../../test/rpc.ts";
import { testPaths } from "../../../../test/setup.ts";
import { AgentHomeLive } from "../../platform/agent-home.ts";
import { PiConfigLive } from "../../platform/pi.ts";
import { PackageHandlersLive } from "./handlers.ts";
import { PackageServiceLive } from "./service.ts";

/**
 * Settings → Packages over the RPC group, against real settings files and a real local
 * package folder. Installing a local path is pi's own installer without a network call;
 * the resource reads are pi's resolver, so the filters are checked where pi matches them.
 */

const packagesLayer = (name: string) => {
	const agentDir = join(testPaths.scratch, `packages-${name}`);
	mkdirSync(join(agentDir, ".epsilon"), { recursive: true });
	const home = AgentHomeLive(agentDir, testPaths.sandboxHome);
	const config = PiConfigLive.pipe(Layer.provideMerge(home));
	const service = PackageServiceLive.pipe(Layer.provideMerge(config), Layer.provideMerge(home));
	return {
		agentDir,
		layer: PackageHandlersLive.pipe(Layer.provideMerge(service)),
	};
};

/** A local package pi accepts: a `package.json` and one folder per resource kind. */
const localPackage = (root: string) => {
	const pkg = join(root, "pkg");
	mkdirSync(join(pkg, "skills", "greet"), { recursive: true });
	mkdirSync(join(pkg, "extensions"), { recursive: true });
	mkdirSync(join(pkg, "prompts"), { recursive: true });
	mkdirSync(join(pkg, "themes"), { recursive: true });
	writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "test-pkg" }));
	writeFileSync(
		join(pkg, "skills", "greet", "SKILL.md"),
		"---\nname: greet\ndescription: Say hello\n---\n\nHello\n",
	);
	writeFileSync(join(pkg, "extensions", "hello.ts"), "export default {};\n");
	writeFileSync(join(pkg, "prompts", "hello.md"), "Say hello.\n");
	writeFileSync(join(pkg, "themes", "hello.json"), "{}\n");
	return pkg;
};

const writeJson = (path: string, value: Schema.Json): void => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

const readJson = (path: string): Schema.Json =>
	Schema.decodeUnknownSync(Schema.Json)(JSON.parse(readFileSync(path, "utf8")));

describe("config.packages", () => {
	test("installs a local package, lists its resources, filters one, and removes it", async () => {
		const { agentDir, layer } = packagesLayer("local");
		const pkg = localPackage(agentDir);

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(PackageRpcs, PackageHandlersLive);
				yield* client["config.packages.install"]({
					folder: null,
					scope: "user",
					source: pkg,
				});
				const list = yield* client["config.packages.list"]({ folder: null });
				const source = list.packages[0]?.source ?? "";
				const before = yield* client["config.packages.resources"]({
					folder: null,
					scope: "user",
					source,
				});
				yield* client["config.packages.setResource"]({
					folder: null,
					input: {
						enabled: false,
						path: join(pkg, "skills", "greet", "SKILL.md"),
						scope: "user",
						source,
						type: "skills",
					},
				});
				const off = yield* client["config.packages.resources"]({
					folder: null,
					scope: "user",
					source,
				});
				const storedOff = readJson(join(agentDir, "settings.json"));
				yield* client["config.packages.setResource"]({
					folder: null,
					input: {
						enabled: true,
						path: join(pkg, "skills", "greet", "SKILL.md"),
						scope: "user",
						source,
						type: "skills",
					},
				});
				const back = yield* client["config.packages.resources"]({
					folder: null,
					scope: "user",
					source,
				});
				const storedOn = readJson(join(agentDir, "settings.json"));
				const updates = yield* client["config.packages.updates"]({ folder: null });
				yield* client["config.packages.update"]({ folder: null, scope: "user", source });
				yield* client["config.packages.remove"]({ folder: null, scope: "user", source });
				const after = yield* client["config.packages.list"]({ folder: null });
				return { after, back, before, list, off, source, storedOff, storedOn, updates };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.list.packages).toHaveLength(1);
		expect(result.list.packages[0]).toMatchObject({
			filtered: false,
			relation: "own",
			scope: "user",
		});
		expect(result.before.skills.map((entry) => [entry.name, entry.enabled])).toEqual([
			["greet", true],
		]);
		expect(result.before.extensions.map((entry) => entry.name)).toEqual(["hello"]);
		expect(result.before.prompts.map((entry) => entry.name)).toEqual(["hello"]);
		expect(result.before.themes.map((entry) => entry.name)).toEqual(["hello"]);
		expect(result.off.skills[0]?.enabled).toBe(false);
		expect(result.back.skills[0]?.enabled).toBe(true);
		expect(result.updates.updates).toEqual([]);
		expect(result.after.packages).toEqual([]);
		// The switch is a filter in the package's own entry, written the way pi writes one.
		expect(result.storedOff).toMatchObject({
			packages: [{ source: result.source, skills: ["-skills/greet/SKILL.md"] }],
		});
		// Turning it back on leaves a plain entry again: a plain entry has nothing to add.
		expect(result.storedOn).toMatchObject({ packages: [result.source] });
	});

	test("a project delta keeps autoload and names the resource it loads with +", async () => {
		const { agentDir, layer } = packagesLayer("delta");
		const project = join(agentDir, "project");
		const pkg = localPackage(agentDir);
		mkdirSync(project, { recursive: true });
		writeJson(join(project, ".pi", "settings.json"), {
			packages: [{ autoload: false, skills: ["-skills/greet/SKILL.md"], source: pkg }],
		});

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(PackageRpcs, PackageHandlersLive);
				const before = yield* client["config.packages.resources"]({
					folder: project,
					scope: "project",
					source: pkg,
				});
				yield* client["config.packages.setResource"]({
					folder: project,
					input: {
						enabled: true,
						path: join(pkg, "skills", "greet", "SKILL.md"),
						scope: "project",
						source: pkg,
						type: "skills",
					},
				});
				const after = yield* client["config.packages.resources"]({
					folder: project,
					scope: "project",
					source: pkg,
				});
				const missing = yield* Effect.flip(
					client["config.packages.setResource"]({
						folder: project,
						input: {
							enabled: false,
							path: join(pkg, "skills", "nope", "SKILL.md"),
							scope: "project",
							source: pkg,
							type: "skills",
						},
					}),
				);
				const noProject = yield* Effect.flip(
					client["config.packages.install"]({
						folder: null,
						scope: "project",
						source: pkg,
					}),
				);
				return { after, before, missing, noProject };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.before.skills[0]?.enabled).toBe(false);
		expect(result.after.skills[0]?.enabled).toBe(true);
		expect(readJson(join(project, ".pi", "settings.json"))).toMatchObject({
			packages: [{ autoload: false, skills: ["+skills/greet/SKILL.md"], source: pkg }],
		});
		expect(result.missing).toBeInstanceOf(PackageFailed);
		expect(result.missing.reason).toContain("does not provide");
		expect(result.noProject).toBeInstanceOf(PackageFailed);
		expect(result.noProject.reason).toContain("Choose a project");
	});

	test("one row for a project entry over the home's, and inherited rows for the rest", async () => {
		const { agentDir, layer } = packagesLayer("rows");
		const project = join(agentDir, "project");
		const pkg = localPackage(agentDir);
		const other = join(agentDir, "other");
		mkdirSync(project, { recursive: true });
		writeJson(join(agentDir, "settings.json"), { packages: [pkg, other] });
		writeJson(join(project, ".pi", "settings.json"), {
			packages: [{ autoload: false, source: pkg }],
		});

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(PackageRpcs, PackageHandlersLive);
				return yield* client["config.packages.list"]({ folder: project });
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.packages).toHaveLength(2);
		expect(result.packages[0]).toMatchObject({
			filtered: true,
			relation: "overrides",
			scope: "project",
			source: pkg,
		});
		expect(result.packages[1]).toMatchObject({
			relation: "inherited",
			scope: "user",
			source: other,
		});
	});

	test("the same npm package at two versions is one row, and only a declared source updates", async () => {
		const { agentDir, layer } = packagesLayer("npm");
		const project = join(agentDir, "project");
		mkdirSync(project, { recursive: true });
		writeJson(join(agentDir, "settings.json"), { packages: ["npm:@scope/tool@1.2.0"] });
		writeJson(join(project, ".pi", "settings.json"), {
			packages: ["npm:@scope/tool@2.0.0"],
		});

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(PackageRpcs, PackageHandlersLive);
				const list = yield* client["config.packages.list"]({ folder: project });
				const home = yield* client["config.packages.list"]({ folder: null });
				const undeclared = yield* Effect.flip(
					client["config.packages.update"]({
						folder: project,
						scope: "user",
						source: "npm:not-declared",
					}),
				);
				return { home, list, undeclared };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.list.packages).toHaveLength(1);
		expect(result.list.packages[0]).toMatchObject({
			filtered: false,
			relation: "overrides",
			scope: "project",
			source: "npm:@scope/tool@2.0.0",
		});
		expect(result.home.packages.map((entry) => entry.relation)).toEqual(["own"]);
		expect(result.undeclared).toBeInstanceOf(PackageFailed);
		expect(result.undeclared.reason).toContain("No declared package matched");
	});
});
