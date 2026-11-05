import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, FileSystem, Layer, type Schema } from "effect";

import { SkillRefused } from "#protocol/errors";
import { SkillRpcs } from "#protocol/settings/skills";
import type { SkillEngineLive } from "#protocol/settings/skills";

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

describe("settings.skills", () => {
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
				return yield* client["settings.skills.list"]({ folder: null });
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
				const before = yield* client["settings.skills.list"]({ folder: null });
				const greet = before.skills.find((skill) => skill.name === "greet");
				yield* client["settings.skills.setEnabled"]({
					enabled: false,
					filePath: greet?.filePath ?? "",
					folder: null,
				});
				const off = yield* client["settings.skills.list"]({ folder: null });
				const stored = readText(join(agentDir, "settings.json"));
				yield* client["settings.skills.setEnabled"]({
					enabled: true,
					filePath: greet?.filePath ?? "",
					folder: null,
				});
				const back = yield* client["settings.skills.list"]({ folder: null });
				const packageSkill = before.skills.find((skill) => skill.origin === "package");
				const refused = yield* Effect.flip(
					client["settings.skills.setEnabled"]({
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
				const before = yield* client["settings.skills.read"]({
					folder: null,
					name: "greet",
					root: "home",
				});
				yield* client["settings.skills.save"]({
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
				const after = yield* client["settings.skills.read"]({
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
				yield* client["settings.skills.writeRaw"]({
					folder: null,
					name: "greet",
					root: "home",
					text: raw,
				});
				const exact = yield* client["settings.skills.readRaw"]({
					folder: null,
					name: "greet",
					root: "home",
				});
				const brokenRead = yield* client["settings.skills.read"]({
					folder: null,
					name: "broken",
					root: "home",
				});
				const brokenSave = yield* Effect.flip(
					client["settings.skills.save"]({
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
					client["settings.skills.writeRaw"]({
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
				yield* client["settings.skills.save"]({
					folder: null,
					input: {
						body: "A new skill",
						description: "Fresh",
						modelInvocation: true,
					},
					name: "fresh",
					root: "home",
				});
				const read = yield* client["settings.skills.read"]({
					folder: null,
					name: "fresh",
					root: "home",
				});
				const text = readText(join(skillsDir, "fresh", "SKILL.md"));
				const escape = yield* Effect.flip(
					client["settings.skills.read"]({
						folder: null,
						name: "../escape",
						root: "home",
					}),
				);
				yield* client["settings.skills.remove"]({
					folder: null,
					name: "fresh",
					root: "home",
				});
				const gone = yield* Effect.flip(
					client["settings.skills.read"]({
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
				return yield* Effect.flip(client["settings.skills.list"]({ folder: project }));
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);
		expect(untrusted.reason).toContain("not trusted");

		writeJson(join(agentDir, "trust.json"), { [projectReal]: true });
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, SkillHandlersLive);
				const list = yield* client["settings.skills.list"]({ folder: project });
				const home = list.skills.find((skill) => skill.name === "home");
				const proj = list.skills.find((skill) => skill.name === "proj");
				const externalDoc = yield* client["settings.skills.readDocument"]({
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
				const list = yield* client["settings.skills.list"]({ folder: null });
				const skill = list.skills.find((entry) => entry.name === "from-extension");
				const refused = yield* Effect.flip(
					client["settings.skills.setEnabled"]({
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

describe("skills of other agents", () => {
	test("lists another agent's folder and links it through pi's setting", async () => {
		const { layer, userHome } = skillsLayer("foreign");
		const claude = join(userHome, ".claude", "skills");
		writeSkill(claude, "from-claude", "name: from-claude\ndescription: Claude's skill");
		// An empty folder is not a skill folder, so Codex contributes nothing here.
		mkdirSync(join(userHome, ".codex", "skills"), { recursive: true });

		const outcome = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, layer);
				const before = yield* client["settings.skills.list"]({ folder: null });
				yield* client["settings.skills.setFolderLinked"]({
					folder: null,
					linked: true,
					path: claude,
				});
				const linked = yield* client["settings.skills.list"]({ folder: null });
				yield* client["settings.skills.setFolderLinked"]({
					folder: null,
					linked: false,
					path: claude,
				});
				const unlinked = yield* client["settings.skills.list"]({ folder: null });
				// A path Epsilon did not detect is refused, so no page can add an arbitrary folder.
				const refused = yield* Effect.flip(
					client["settings.skills.setFolderLinked"]({
						folder: null,
						linked: true,
						path: "/etc",
					}),
				);
				return { before, linked, refused, unlinked };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(outcome.before.foreignSkills).toHaveLength(1);
		expect(outcome.before.foreignSkills[0]).toMatchObject({
			agent: "claude-code",
			folder: claude,
			linked: false,
			scope: "user",
		});
		expect(outcome.linked.foreignSkills[0]?.linked).toBe(true);
		// Linked means pi loads it where it is: the skill arrives as a path, not a copy.
		expect(outcome.linked.skills.find((view) => view.name === "from-claude")).toMatchObject({
			editable: false,
			origin: "settings-path",
			status: "active",
		});
		expect(outcome.unlinked.foreignSkills[0]?.linked).toBe(false);
		expect(outcome.refused).toBeInstanceOf(SkillRefused);
		expect(outcome.refused.reason).toContain("not a skill folder");
	});
});

/** A skill with a `SKILL.md`, as the bundle routes need one to exist. */
const probeSkill = (skillsDir: string, name = "probe"): string => {
	const dir = writeSkill(skillsDir, name, "name: probe\ndescription: A probe");
	return dir;
};

describe("the files bundled in a skill", () => {
	test("lists text and binary files, skipping stripped paths and symlinks", async () => {
		const { layer, skillsDir } = skillsLayer("bundle-list");
		const dir = probeSkill(skillsDir);
		mkdirSync(join(dir, "scripts"));
		mkdirSync(join(dir, "node_modules"));
		mkdirSync(join(dir, ".git"));
		writeFileSync(join(dir, "scripts", "run.sh"), "echo hi\n");
		writeFileSync(join(dir, "logo.png"), Buffer.from([0x89, 0x50, 0, 1, 2]));
		writeFileSync(join(dir, "latin.txt"), Buffer.from([0xe9, 0x63, 0x63]));
		writeFileSync(join(dir, ".DS_Store"), "x");
		writeFileSync(join(dir, "node_modules", "a.js"), "x");
		writeFileSync(join(dir, ".git", "HEAD"), "x");
		symlinkSync(join(dir, "SKILL.md"), join(dir, "link.md"));

		const list = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, layer);
				return yield* client["settings.skills.listFiles"]({
					folder: null,
					name: "probe",
					root: "home",
				});
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(list.skipped).toBe(1);
		expect(list.folders).toEqual(["scripts"]);
		expect(list.files.map((file) => [file.path, file.text])).toEqual([
			["SKILL.md", true],
			["latin.txt", false],
			["logo.png", false],
			["scripts/run.sh", true],
		]);
	});

	test("writes, reads and deletes, cleaning the folders it empties", async () => {
		const { layer, skillsDir } = skillsLayer("bundle-write");
		const dir = probeSkill(skillsDir);

		const outcome = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, layer);
				const call = (path: string) => ({
					folder: null,
					name: "probe",
					path,
					root: "home" as const,
				});
				yield* client["settings.skills.writeFile"]({
					...call("references/deep/a.md"),
					text: "# A\n",
				});
				const read = yield* client["settings.skills.readFile"](call("references/deep/a.md"));
				yield* client["settings.skills.writeFile"]({ ...call("references/b.md"), text: "b" });
				yield* client["settings.skills.deleteFile"](call("references/deep/a.md"));
				const deepGone = !existsSync(join(dir, "references", "deep"));
				const referencesLeft = existsSync(join(dir, "references"));
				yield* client["settings.skills.deleteFile"](call("references/b.md"));
				return {
					deepGone,
					read,
					referencesGone: !existsSync(join(dir, "references")),
					referencesLeft,
				};
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(outcome.read.text).toBe("# A\n");
		expect(outcome.deepGone).toBe(true);
		expect(outcome.referencesLeft).toBe(true);
		expect(outcome.referencesGone).toBe(true);
		// Deleting a file never takes the skill's own folder.
		expect(existsSync(join(dir, "SKILL.md"))).toBe(true);
	});

	test("keeps the exec bit when a script is edited", async () => {
		const { layer, skillsDir } = skillsLayer("bundle-mode");
		const dir = probeSkill(skillsDir);
		const script = join(dir, "run.sh");
		writeFileSync(script, "echo 1\n");
		chmodSync(script, 0o755);

		await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, layer);
				yield* client["settings.skills.writeFile"]({
					folder: null,
					name: "probe",
					path: "run.sh",
					root: "home",
					text: "echo 2\n",
				});
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(statSync(script).mode & 0o777).toBe(0o755);
		expect(readFileSync(script, "utf8")).toBe("echo 2\n");
	});

	test("refuses SKILL.md as a bundled file, and unsafe or stripped paths", async () => {
		const { layer, skillsDir } = skillsLayer("bundle-refuse");
		probeSkill(skillsDir);
		const unsafe = [
			"SKILL.md",
			"../x",
			"a/../../x",
			"/etc/x",
			"a\\b",
			"a//b",
			".git/config",
			"n/node_modules/x",
		];

		const refused = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, layer);
				const problems: string[] = [];
				for (const path of unsafe) {
					const base = { folder: null, name: "probe", path, root: "home" as const };
					const write = yield* Effect.flip(
						client["settings.skills.writeFile"]({ ...base, text: "x" }),
					);
					const read = yield* Effect.flip(client["settings.skills.readFile"](base));
					const removed = yield* Effect.flip(client["settings.skills.deleteFile"](base));
					problems.push(write.reason, read.reason, removed.reason);
				}
				return problems;
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(refused).toHaveLength(unsafe.length * 3);
		expect(refused.every((reason) => reason !== "")).toBe(true);
	});

	test("refuses a symlink on the way, and writes nothing through it", async () => {
		const { layer, root, skillsDir } = skillsLayer("bundle-link");
		const dir = probeSkill(skillsDir);
		const outside = join(root, "outside");
		mkdirSync(outside, { recursive: true });
		writeFileSync(join(outside, "secret.txt"), "secret");
		symlinkSync(outside, join(dir, "linked"));
		symlinkSync(join(outside, "secret.txt"), join(dir, "file.txt"));

		const refused = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, layer);
				const base = { folder: null, name: "probe", root: "home" as const };
				const read = yield* Effect.flip(
					client["settings.skills.readFile"]({ ...base, path: "linked/secret.txt" }),
				);
				const write = yield* Effect.flip(
					client["settings.skills.writeFile"]({ ...base, path: "linked/new.txt", text: "x" }),
				);
				const replace = yield* Effect.flip(
					client["settings.skills.writeFile"]({ ...base, path: "file.txt", text: "x" }),
				);
				const removed = yield* Effect.flip(
					client["settings.skills.deleteFile"]({ ...base, path: "file.txt" }),
				);
				return [read, write, replace, removed].map((error) => error.reason);
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(refused.every((reason) => reason.includes("symlink"))).toBe(true);
		expect(readFileSync(join(outside, "secret.txt"), "utf8")).toBe("secret");
		expect(existsSync(join(outside, "new.txt"))).toBe(false);
	});

	test("refuses a binary or oversized read, a missing file and a missing skill", async () => {
		const { layer, skillsDir } = skillsLayer("bundle-read");
		const dir = probeSkill(skillsDir);
		writeFileSync(join(dir, "bin"), Buffer.from([1, 0, 2]));
		writeFileSync(join(dir, "big.txt"), "a".repeat(1024 * 1024 + 1));

		const reasons = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, layer);
				const base = { folder: null, name: "probe", root: "home" as const };
				const binary = yield* Effect.flip(
					client["settings.skills.readFile"]({ ...base, path: "bin" }),
				);
				const oversized = yield* Effect.flip(
					client["settings.skills.readFile"]({ ...base, path: "big.txt" }),
				);
				const missing = yield* Effect.flip(
					client["settings.skills.readFile"]({ ...base, path: "missing.txt" }),
				);
				const noSkill = yield* Effect.flip(
					client["settings.skills.listFiles"]({ ...base, name: "nope" }),
				);
				const escape = yield* Effect.flip(
					client["settings.skills.listFiles"]({ ...base, name: "../probe" }),
				);
				return [binary.reason, oversized.reason, missing.reason, noSkill.reason, escape.reason];
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(reasons[0]).toContain("binary");
		expect(reasons[1]).toContain("1 MB");
		expect(reasons[2]).toContain("does not exist");
		expect(reasons[3]).toContain("No skill");
		expect(reasons[4]).toContain("not a skill directory name");
	});

	test("refuses a write that takes the folder past its limit, and counts a replacement", async () => {
		const { layer, skillsDir } = skillsLayer("bundle-size");
		const dir = probeSkill(skillsDir);
		const chunk = "a".repeat(4 * 1024 * 1024);
		for (let index = 0; index < 6; index += 1) {
			writeFileSync(join(dir, `f${index}.txt`), chunk);
		}

		const refusal = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, layer);
				return yield* Effect.flip(
					client["settings.skills.writeFile"]({
						folder: null,
						name: "probe",
						path: "more.txt",
						root: "home",
						text: chunk,
					}),
				);
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(refusal.reason).toContain("25 MB");
		expect(existsSync(join(dir, "more.txt"))).toBe(false);
	});

	test("follows a linked skill folder only into another editable skills folder", async () => {
		const { layer, skillsDir, userHome } = skillsLayer("bundle-follow");
		mkdirSync(skillsDir, { recursive: true });
		const shared = join(userHome, ".agents", "skills");
		mkdirSync(join(shared, "probe"), { recursive: true });
		writeFileSync(join(shared, "probe", "SKILL.md"), "---\nname: probe\ndescription: x\n---\n");
		symlinkSync(join(shared, "probe"), join(skillsDir, "probe"));
		const elsewhere = join(userHome, "elsewhere");
		mkdirSync(join(elsewhere, "stray"), { recursive: true });
		writeFileSync(join(elsewhere, "stray", "SKILL.md"), "---\nname: stray\ndescription: x\n---\n");
		symlinkSync(join(elsewhere, "stray"), join(skillsDir, "stray"));

		const outcome = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, layer);
				const base = { folder: null, root: "home" as const };
				const linked = yield* client["settings.skills.listFiles"]({ ...base, name: "probe" });
				yield* client["settings.skills.writeFile"]({
					...base,
					name: "probe",
					path: "more.md",
					text: "x",
				});
				const stray = yield* Effect.flip(
					client["settings.skills.listFiles"]({ ...base, name: "stray" }),
				);
				return { linked, stray };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(outcome.linked.files.map((file) => file.path)).toEqual(["SKILL.md"]);
		// The write landed in the folder the link names, not in a copy.
		expect(readFileSync(join(shared, "probe", "more.md"), "utf8")).toBe("x");
		expect(outcome.stray.reason).toContain("links outside");
	});
});

describe("the files of a skill Epsilon does not edit", () => {
	test("lists the folder and reads SKILL.md and bundled files, refusing binary and unsafe ones", async () => {
		const { agentDir, layer, root } = skillsLayer("document-files");
		const shared = join(root, "shared");
		const dir = writeSkill(shared, "probe", "name: probe\ndescription: A probe");
		mkdirSync(join(dir, "references"));
		mkdirSync(join(dir, "node_modules"));
		writeFileSync(join(dir, "references", "a.md"), "# A\n");
		writeFileSync(join(dir, "logo.png"), Buffer.from([0x89, 0x50, 0, 1, 2]));
		writeFileSync(join(dir, "node_modules", "a.js"), "x");
		const outside = join(root, "outside");
		mkdirSync(outside, { recursive: true });
		writeFileSync(join(outside, "secret.txt"), "secret");
		symlinkSync(outside, join(dir, "linked"));
		// A skills setting path is where a listed skill comes from: Epsilon edits neither.
		writeJson(join(agentDir, "settings.json"), { skills: [shared] });

		const outcome = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, layer);
				const list = yield* client["settings.skills.list"]({ folder: null });
				const probe = list.skills.find((skill) => skill.name === "probe");
				const filePath = probe?.filePath ?? "";
				const files = yield* client["settings.skills.listDocumentFiles"]({
					folder: null,
					filePath,
				});
				const document = yield* client["settings.skills.readDocumentFile"]({
					folder: null,
					filePath,
					path: "SKILL.md",
				});
				const reference = yield* client["settings.skills.readDocumentFile"]({
					folder: null,
					filePath,
					path: "references/a.md",
				});
				const read = (path: string) =>
					Effect.flip(client["settings.skills.readDocumentFile"]({ folder: null, filePath, path }));
				const binary = yield* read("logo.png");
				const symlink = yield* read("linked/secret.txt");
				const stripped = yield* read("node_modules/a.js");
				const escape = yield* read("../outside/secret.txt");
				const missing = yield* Effect.flip(
					client["settings.skills.listDocumentFiles"]({
						folder: null,
						filePath: join(dir, "absent", "SKILL.md"),
					}),
				);
				return { binary, document, escape, files, missing, probe, reference, stripped, symlink };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(outcome.probe).toMatchObject({
			origin: "settings-path",
			status: "active",
			toggle: "settings",
		});
		expect(outcome.probe?.editable).toBe(false);
		expect(outcome.files.files.map((file) => [file.path, file.text])).toEqual([
			["SKILL.md", true],
			["logo.png", false],
			["references/a.md", true],
		]);
		expect(outcome.files.folders).toEqual(["references"]);
		expect(outcome.document.text).toContain("name: probe");
		expect(outcome.reference.text).toBe("# A\n");
		expect(outcome.binary.reason).toContain("binary");
		expect(outcome.symlink.reason).toContain("symlink");
		expect(outcome.stripped.reason).toContain("does not manage");
		expect(outcome.escape.reason).toBeTruthy();
		expect(outcome.missing).toBeInstanceOf(SkillRefused);
		expect(outcome.missing.reason).toContain("No such skill");
	});

	test("a skill that is one markdown file lists and reads only itself", async () => {
		const { agentDir, layer, root } = skillsLayer("document-lone");
		const shared = join(root, "shared");
		mkdirSync(shared, { recursive: true });
		const lone = join(shared, "lone.md");
		writeFileSync(lone, "---\nname: lone\ndescription: One file\n---\n");
		writeFileSync(join(shared, "neighbour.md"), "private");
		writeJson(join(agentDir, "settings.json"), { skills: [lone] });

		const outcome = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillRpcs, layer);
				const files = yield* client["settings.skills.listDocumentFiles"]({
					folder: null,
					filePath: lone,
				});
				const own = yield* client["settings.skills.readDocumentFile"]({
					folder: null,
					filePath: lone,
					path: "lone.md",
				});
				const neighbour = yield* Effect.flip(
					client["settings.skills.readDocumentFile"]({
						folder: null,
						filePath: lone,
						path: "neighbour.md",
					}),
				);
				return { files, neighbour, own };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(outcome.files.files.map((file) => file.path)).toEqual(["lone.md"]);
		expect(outcome.files.folders).toEqual([]);
		expect(outcome.own.text).toContain("description: One file");
		expect(outcome.neighbour.reason).toContain("not part of this skill");
	});
});
