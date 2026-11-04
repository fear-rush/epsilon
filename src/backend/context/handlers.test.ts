import { describe, expect, test } from "bun:test";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, FileSystem, Layer } from "effect";

import { ContextRpcs } from "#protocol/context";
import type { ContextEngineLive } from "#protocol/context";
import { ProjectNotTrusted } from "#protocol/errors";

import { testClient } from "../../../test/rpc.ts";
import { testPaths } from "../../../test/setup.ts";
import { ProjectService, ProjectServiceLive } from "../config/projects/service.ts";
import { makeSkillsService, SkillsService } from "../config/skills/service.ts";
import { AgentHome, AgentHomeLive } from "../platform/agent-home.ts";
import { PiConfig, PiConfigLive } from "../platform/pi.ts";
import { ContextHandlersLive } from "./handlers.ts";
import { makeContextService, ContextService } from "./service.ts";

/**
 * The context page over its RPC, against a real agent home and project. The live fields
 * come from one injected engine answer; everything else is pi's resolver, the files and
 * the skills inventory.
 */

const contextLayer = (name: string, live: ContextEngineLive | undefined) => {
	const root = join(testPaths.scratch, `context-${name}`);
	const agentDir = join(root, "agent");
	const userHome = join(root, "home");
	mkdirSync(join(agentDir, ".epsilon"), { recursive: true });
	mkdirSync(userHome, { recursive: true });
	const home = AgentHomeLive(agentDir, userHome);
	const platform = Layer.mergeAll(home, BunServices.layer);
	const pi = PiConfigLive.pipe(Layer.provideMerge(home));
	const projects = ProjectServiceLive.pipe(Layer.provideMerge(platform), Layer.provideMerge(pi));
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
	const context = Layer.effect(
		ContextService,
		Effect.gen(function* () {
			const agentHome = yield* AgentHome;
			const config = yield* PiConfig;
			const projectService = yield* ProjectService;
			const skillService = yield* SkillsService;
			const fs = yield* FileSystem.FileSystem;
			return makeContextService({
				fs,
				home: agentHome,
				live: () => Effect.succeed(live === undefined ? [] : [live]),
				pi: config,
				skills: skillService,
				trust: (path) => projectService.trusted(path),
			});
		}),
	).pipe(
		Layer.provideMerge(platform),
		Layer.provideMerge(pi),
		Layer.provideMerge(projects),
		Layer.provideMerge(skills),
	);
	return {
		agentDir,
		layer: ContextHandlersLive.pipe(Layer.provideMerge(context)),
		root,
	};
};

const write = (path: string, text: string): void => {
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, text);
};

const skill = (root: string, name: string, description: string): void => {
	const dir = join(root, name);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "SKILL.md"),
		`---\nname: ${name}\ndescription: ${description}\n---\n\nBody\n`,
	);
};

describe("context.read", () => {
	test("reads the files pi loads, the resolver's resources and one live engine", async () => {
		const live: ContextEngineLive = {
			contextUsage: { contextWindow: 1000, percent: 10, tokens: 100 },
			sessionId: "s-live",
			systemPrompt: "Live prompt",
			tools: {
				active: ["read"],
				all: [{ description: "Read a file", name: "read" }],
			},
		};
		const built = contextLayer("project", live);
		const project = join(built.root, "project");
		mkdirSync(join(project, ".pi", "prompts"), { recursive: true });
		mkdirSync(join(project, ".pi", "extensions"), { recursive: true });
		write(join(built.agentDir, "AGENTS.md"), "Agent context\n");
		write(join(built.agentDir, "SYSTEM.md"), "Agent prompt\n");
		write(join(project, "AGENTS.md"), "Project context\n");
		write(join(project, ".pi", "SYSTEM.md"), "Project prompt\n");
		write(join(project, ".pi", "APPEND_SYSTEM.md"), "Appended prompt\n");
		write(
			join(project, ".pi", "prompts", "hello.md"),
			"---\ndescription: Say hello\nargument-hint: <name>\n---\n\nHello\n",
		);
		write(join(project, ".pi", "prompts", "broken.md"), "---\ninvalid: [unclosed\n---\n\nBroken\n");
		write(join(project, ".pi", "extensions", "hello.ts"), "export default {};\n");
		skill(join(project, ".pi", "skills"), "greet", "Project skill");
		const pkg = join(built.root, "pkg");
		write(join(pkg, "package.json"), JSON.stringify({ name: "pkg" }));
		write(join(pkg, "extensions", "pkg.ts"), "export default {};\n");
		write(join(pkg, "prompts", "pkg.md"), "---\ndescription: Package prompt\n---\n\nPkg\n");
		write(join(pkg, "themes", "pkg.json"), "{}\n");
		skill(join(pkg, "skills"), "pkg-skill", "Package skill");
		write(join(built.agentDir, "settings.json"), JSON.stringify({ packages: [pkg] }, null, 2));
		const projectReal = realpathSync(project);
		write(join(built.agentDir, "trust.json"), JSON.stringify({ [projectReal]: true }));

		const view = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(ContextRpcs, ContextHandlersLive);
				return yield* client["context.read"]({ folder: project });
			}).pipe(Effect.scoped, Effect.provide(built.layer)),
		);

		expect(view.folder).toBe(projectReal);
		expect(view.project).toBe(projectReal);
		expect(view.live).toBe(true);
		expect(view.liveSessionId).toBe("s-live");
		expect(view.systemPrompt).toMatchObject({
			appendPaths: [join(projectReal, ".pi", "APPEND_SYSTEM.md")],
			replacePath: join(projectReal, ".pi", "SYSTEM.md"),
			source: "project",
			text: "Live prompt",
		});
		expect(view.contextFiles.map((file) => file.path)).toEqual(
			expect.arrayContaining([join(built.agentDir, "AGENTS.md"), join(projectReal, "AGENTS.md")]),
		);
		expect(view.prompts.find((prompt) => prompt.name === "hello")).toMatchObject({
			argumentHint: "<name>",
			description: "Say hello",
			origin: "settings-path",
		});
		expect(view.prompts.find((prompt) => prompt.name === "pkg")?.origin).toBe("package");
		expect(view.extensions.map((extension) => extension.name)).toEqual(
			expect.arrayContaining(["hello", "pkg"]),
		);
		expect(view.packages.find((entry) => entry.source === pkg)?.resources).toEqual({
			extensions: 1,
			prompts: 1,
			skills: 1,
			themes: 1,
		});
		expect(view.problems.some((problem) => problem.kind === "prompt")).toBe(true);
		expect(view.tools).toEqual({
			active: ["read"],
			all: [{ description: "Read a file", name: "read" }],
		});
		expect(view.contextUsage).toEqual({ contextWindow: 1000, percent: 10, tokens: 100 });
	});

	test("a gated project must be trusted before its context is read", async () => {
		const built = contextLayer("untrusted", undefined);
		const project = join(built.root, "project");
		mkdirSync(join(project, ".pi"), { recursive: true });
		write(join(project, ".pi", "mcp.json"), "{}\n");

		const failure = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(ContextRpcs, ContextHandlersLive);
				return yield* Effect.flip(client["context.read"]({ folder: project }));
			}).pipe(Effect.scoped, Effect.provide(built.layer)),
		);
		expect(failure).toBeInstanceOf(ProjectNotTrusted);
	});
});
