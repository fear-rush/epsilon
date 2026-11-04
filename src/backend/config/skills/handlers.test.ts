import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, FileSystem, Layer, type Schema } from "effect";

import { SkillRpcs } from "#protocol/config/skills";
import type { SkillEngineLive } from "#protocol/config/skills";
import { SkillRefused } from "#protocol/errors";

import { testClient } from "../../../../test/rpc.ts";
import { testPaths } from "../../../../test/setup.ts";
import { AgentHome, AgentHomeLive } from "../../platform/agent-home.ts";
import { PiConfig, PiConfigLive } from "../../platform/pi.ts";
import { ProjectService, ProjectServiceLive } from "../projects/service.ts";
import { SkillHandlersLive } from "./handlers.ts";
import { makeSkillsService, SkillsService } from "./service.ts";

/**
 * Settings → Skills over the RPC group, against real skill folders and a real agent home.
 * The inventory is pi's resolver and loader; the switches are pi's `skills` setting, so a
 * filter is checked where pi matches it.
 */

const skillsLayer = (name: string, live: ReadonlyArray<SkillEngineLive> = []) => {
	const root = join(testPaths.scratch, `skills-${name}`);
	const agentDir = join(root, "agent");
	const userHome = join(root, "home");
	mkdirSync(join(agentDir, ".epsilon"), { recursive: true });
	mkdirSync(userHome, { recursive: true });
	const home = AgentHomeLive(agentDir, userHome);
	const platform = Layer.mergeAll(home, BunServices.layer);
	const pi = PiConfigLive.pipe(Layer.provideMerge(home));
	const projects = ProjectServiceLive.pipe(Layer.provideMerge(platform), Layer.provideMerge(pi));
	const service = Layer.effect(
		SkillsService,
		Effect.gen(function* () {
			const agentHome = yield* AgentHome;
			const config = yield* PiConfig;
			const projectService = yield* ProjectService;
			const fs = yield* FileSystem.FileSystem;
			return makeSkillsService({
				extensionSkills: () => Effect.succeed(live),
				fs,
				home: agentHome,
				skills: (cwd) => config.skills(cwd),
				trusted: (path) => projectService.trusted(path),
			});
		}),
	).pipe(Layer.provideMerge(platform), Layer.provideMerge(pi), Layer.provideMerge(projects));
	return {
		agentDir,
		layer: SkillHandlersLive.pipe(Layer.provideMerge(service)),
		root,
		skillsDir: join(agentDir, "skills"),
		userHome,
	};
};

const writeSkill = (root: string, folder: string, frontmatter: string, body = "Body"): string => {
	const dir = join(root, folder);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "SKILL.md"), `---\n${frontmatter}\n---\n\n${body}\n`);
	return dir;
};

const writeJson = (path: string, value: Schema.Json): void => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

const readText = (path: string): string => readFileSync(path, "utf8");

describe("config.skills", () => {
	test("lists the home's skills with their status, origin and warnings", async () => {
		const { layer, skillsDir } = skillsLayer("list");
		writeSkill(skillsDir, "greet", "name: greet\ndescription: Say hello");
		writeSkill(
			skillsDir,
			"manual",
			"name: manual\ndescription: Ask first\ndisable-model-invocation: true",
		);
		writeSkill(skillsDir, "nodesc", "name: nodesc");
		writeSkill(
			skillsDir,
			"warned",
			"name: different\ndescription: Has warnings\nwhen_to_use: always",
		);
		writeSkill(skillsDir, "dup-a", "name: duplicate\ndescription: First");
		writeSkill(skillsDir, "dup-b", "name: duplicate\ndescription: Second");

		const view = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, SkillHandlersLive);
				return yield* client["config.skills.list"]({ folder: null });
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		const greet = view.skills.find((skill) => skill.name === "greet");
		expect(greet).toMatchObject({
			editable: true,
			origin: "home",
			root: "home",
			scope: "user",
			status: "active",
			toggle: "settings",
		});
		expect(view.skills.find((skill) => skill.name === "manual")?.status).toBe("manual");
		const invalid = view.skills.find((skill) => skill.name === "nodesc");
		expect(invalid?.status).toBe("invalid");
		expect(invalid?.message).toBeTruthy();
		const warned = view.skills.find((skill) => skill.folder === "warned");
		expect(warned?.warnings).toEqual([
			'The name "different" differs from the folder "warned"',
			"pi ignores these Claude Code fields: when_to_use",
		]);
		const shadowed = view.skills.find((skill) => skill.status === "shadowed");
		expect(shadowed?.shadowedBy).toContain("dup-");
	});

	test("a switch writes the settings entry pi matches, and a package skill refuses it", async () => {
		const { agentDir, layer, skillsDir } = skillsLayer("toggle");
		const greetDir = writeSkill(skillsDir, "greet", "name: greet\ndescription: Say hello");
		const pkg = join(agentDir, "local-pkg");
		writeSkill(join(pkg, "skills"), "from-package", "name: from-package\ndescription: Package");
		writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "local-pkg" }));
		writeJson(join(agentDir, "settings.json"), { packages: [pkg] });

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, SkillHandlersLive);
				const before = yield* client["config.skills.list"]({ folder: null });
				const greet = before.skills.find((skill) => skill.name === "greet");
				yield* client["config.skills.setEnabled"]({
					enabled: false,
					filePath: greet?.filePath ?? "",
					folder: null,
				});
				const off = yield* client["config.skills.list"]({ folder: null });
				const stored = readText(join(agentDir, "settings.json"));
				yield* client["config.skills.setEnabled"]({
					enabled: true,
					filePath: greet?.filePath ?? "",
					folder: null,
				});
				const back = yield* client["config.skills.list"]({ folder: null });
				const packageSkill = before.skills.find((skill) => skill.origin === "package");
				const refused = yield* Effect.flip(
					client["config.skills.setEnabled"]({
						enabled: false,
						filePath: packageSkill?.filePath ?? "",
						folder: null,
					}),
				);
				return { back, before, greetDir, off, refused, stored };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.off.skills.find((skill) => skill.name === "greet")?.status).toBe("disabled");
		expect(JSON.parse(result.stored)).toMatchObject({ skills: [`-${result.greetDir}`] });
		expect(result.back.skills.find((skill) => skill.name === "greet")?.status).toBe("active");
		expect(result.before.skills.find((skill) => skill.origin === "package")).toMatchObject({
			toggle: "package",
		});
		expect(result.refused).toBeInstanceOf(SkillRefused);
		expect(result.refused.reason).toContain("Packages");
	});

	test("a save keeps the keys and comments the panel does not manage", async () => {
		const { layer, skillsDir } = skillsLayer("save");
		const dir = join(skillsDir, "greet");
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "SKILL.md"),
			"---\nname: greet\ndescription: Say hello\n# keep this comment\ncustom: keep\nlicense: MIT\n---\n\nOld body\n",
		);

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, SkillHandlersLive);
				const before = yield* client["config.skills.read"]({
					folder: null,
					name: "greet",
					root: "home",
				});
				yield* client["config.skills.save"]({
					folder: null,
					input: {
						body: "New body",
						description: "New description",
						license: "",
						metadata: { audience: "team" },
						modelInvocation: false,
					},
					name: "greet",
					root: "home",
				});
				const after = yield* client["config.skills.read"]({
					folder: null,
					name: "greet",
					root: "home",
				});
				return { after, before, text: readText(join(dir, "SKILL.md")) };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.before.fields.map((field) => field.key)).toContain("custom");
		expect(result.before.license).toBe("MIT");
		expect(result.after.description).toBe("New description");
		expect(result.after.body).toBe("New body");
		expect(result.after.modelInvocation).toBe(false);
		expect(result.after.metadata).toEqual({ audience: "team" });
		expect(result.after.license).toBeUndefined();
		expect(result.text).toContain("# keep this comment");
		expect(result.text).toContain("custom: keep");
		expect(result.text).toContain("disable-model-invocation: true");
	});

	test("raw text is written byte for byte, and a file that does not parse is never rewritten", async () => {
		const { layer, skillsDir } = skillsLayer("raw");
		const dir = writeSkill(skillsDir, "greet", "name: greet\ndescription: Say hello");
		const broken = writeSkill(skillsDir, "broken", "name: [unclosed");
		const raw = "---\nname: greet\ndescription: Say hello\n# comment\n---\n\nText\n";

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, SkillHandlersLive);
				yield* client["config.skills.writeRaw"]({
					folder: null,
					name: "greet",
					root: "home",
					text: raw,
				});
				const exact = yield* client["config.skills.readRaw"]({
					folder: null,
					name: "greet",
					root: "home",
				});
				const brokenRead = yield* client["config.skills.read"]({
					folder: null,
					name: "broken",
					root: "home",
				});
				const brokenSave = yield* Effect.flip(
					client["config.skills.save"]({
						folder: null,
						input: {
							body: "Body",
							description: "Changed",
							modelInvocation: true,
						},
						name: "broken",
						root: "home",
					}),
				);
				const invalidRaw = yield* Effect.flip(
					client["config.skills.writeRaw"]({
						folder: null,
						name: "greet",
						root: "home",
						text: "---\nname: greet\n---\n\nNo description\n",
					}),
				);
				return {
					brokenRead,
					brokenSave,
					exact: exact.text,
					invalidRaw,
					written: readText(join(dir, "SKILL.md")),
					brokenText: readText(join(broken, "SKILL.md")),
				};
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.exact).toBe(raw);
		expect(result.written).toBe(raw);
		expect(result.brokenRead.parseError).toBeTruthy();
		expect(result.brokenRead.raw).toContain("[unclosed");
		expect(result.brokenSave.reason).toContain("not changed");
		expect(result.brokenText).toContain("[unclosed");
		expect(result.invalidRaw.reason).toContain("description");
	});

	test("creates a skill folder, refuses a name that escapes, and removes it", async () => {
		const { layer, skillsDir } = skillsLayer("create");
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, SkillHandlersLive);
				yield* client["config.skills.save"]({
					folder: null,
					input: {
						body: "A new skill",
						description: "Fresh",
						modelInvocation: true,
					},
					name: "fresh",
					root: "home",
				});
				const read = yield* client["config.skills.read"]({
					folder: null,
					name: "fresh",
					root: "home",
				});
				const text = readText(join(skillsDir, "fresh", "SKILL.md"));
				const escape = yield* Effect.flip(
					client["config.skills.read"]({
						folder: null,
						name: "../escape",
						root: "home",
					}),
				);
				yield* client["config.skills.remove"]({
					folder: null,
					name: "fresh",
					root: "home",
				});
				const gone = yield* Effect.flip(
					client["config.skills.read"]({
						folder: null,
						name: "fresh",
						root: "home",
					}),
				);
				return { escape, gone, read, text };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.read.name).toBe("fresh");
		expect(result.read.description).toBe("Fresh");
		expect(result.text).toContain("name: fresh");
		expect(result.escape).toBeInstanceOf(SkillRefused);
		expect(result.gone).toBeInstanceOf(SkillRefused);
	});

	test("a project skill needs trust, and a listed document is read by path", async () => {
		const { agentDir, layer, root, skillsDir } = skillsLayer("project");
		const project = join(root, "project");
		const externalRoot = join(root, "external");
		mkdirSync(project, { recursive: true });
		writeSkill(join(project, ".pi", "skills"), "proj", "name: proj\ndescription: Project skill");
		const externalDir = writeSkill(
			externalRoot,
			"external",
			"name: external\ndescription: Outside",
		);
		writeJson(join(agentDir, "settings.json"), { skills: [externalRoot] });
		writeSkill(skillsDir, "home", "name: home\ndescription: Home skill");
		const projectReal = realpathSync(project);

		const untrusted = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, SkillHandlersLive);
				return yield* Effect.flip(client["config.skills.list"]({ folder: project }));
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);
		expect(untrusted.reason).toContain("not trusted");

		writeJson(join(agentDir, "trust.json"), { [projectReal]: true });
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, SkillHandlersLive);
				const list = yield* client["config.skills.list"]({ folder: project });
				const home = list.skills.find((skill) => skill.name === "home");
				const proj = list.skills.find((skill) => skill.name === "proj");
				const externalDoc = yield* client["config.skills.readDocument"]({
					folder: project,
					filePath: join(externalDir, "SKILL.md"),
				});
				return { externalDoc, home, list, proj };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.home?.status).toBe("active");
		expect(result.proj).toMatchObject({
			origin: "project-pi",
			root: "project-pi",
			scope: "project",
			status: "active",
		});
		expect(result.externalDoc.description).toBe("Outside");
	});

	test("an extension skill a live engine reports is listed as read-only", async () => {
		const liveDir = join(testPaths.scratch, "skills-live", "extension-skill");
		mkdirSync(liveDir, { recursive: true });
		writeFileSync(
			join(liveDir, "SKILL.md"),
			"---\nname: from-extension\ndescription: Live\n---\n\nBody\n",
		);
		const { layer } = skillsLayer("live", [
			{
				baseDir: liveDir,
				description: "Live",
				disableModelInvocation: false,
				filePath: join(liveDir, "SKILL.md"),
				name: "from-extension",
			},
		]);

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, SkillHandlersLive);
				const list = yield* client["config.skills.list"]({ folder: null });
				const skill = list.skills.find((entry) => entry.name === "from-extension");
				const refused = yield* Effect.flip(
					client["config.skills.setEnabled"]({
						enabled: false,
						filePath: skill?.filePath ?? "",
						folder: null,
					}),
				);
				return { refused, skill };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.skill).toMatchObject({
			editable: false,
			origin: "extension",
			status: "active",
			toggle: "none",
		});
		expect(result.refused).toBeInstanceOf(SkillRefused);
		expect(result.refused.reason).toContain("cannot be turned off");
	});
});
