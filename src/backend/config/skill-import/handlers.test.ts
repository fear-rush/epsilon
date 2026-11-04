import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { Effect, FileSystem, Layer } from "effect";
import { zipSync } from "fflate";

import { SkillImportRpcs } from "#protocol/config/skill-import";
import { ImportFailed, StageGone } from "#protocol/errors";

import { testClient } from "../../../../test/rpc.ts";
import { testPaths } from "../../../../test/setup.ts";
import { AgentHome, AgentHomeLive } from "../../platform/agent-home.ts";
import { PiConfigLive } from "../../platform/pi.ts";
import { ProjectService, ProjectServiceLive } from "../projects/service.ts";
import { SkillImportHandlersLive } from "./handlers.ts";
import { makeSkillImportService, SkillImportService } from "./service.ts";
import type { SourceFetcher } from "./service.ts";

/**
 * The import pipeline over the RPC group, against real staged files. The source fetcher
 * is injected, so no test runs `skills` or touches the network; the upload path, the
 * archive parser, the candidate checks and the commit move real files.
 */

const importLayer = (name: string, fetchSource: SourceFetcher) => {
	const root = join(testPaths.scratch, `skill-import-${name}`);
	const agentDir = join(root, "agent");
	const userHome = join(root, "home");
	mkdirSync(join(agentDir, ".epsilon"), { recursive: true });
	mkdirSync(userHome, { recursive: true });
	const home = AgentHomeLive(agentDir, userHome);
	const platform = Layer.mergeAll(home, BunServices.layer);
	const pi = PiConfigLive.pipe(Layer.provideMerge(home));
	const projects = ProjectServiceLive.pipe(Layer.provideMerge(platform), Layer.provideMerge(pi));
	const service = Layer.effect(
		SkillImportService,
		Effect.gen(function* () {
			const agentHome = yield* AgentHome;
			const projectService = yield* ProjectService;
			const fs = yield* FileSystem.FileSystem;
			return makeSkillImportService({
				fetchSource,
				fs,
				home: agentHome,
				trusted: (path) => projectService.trusted(path),
			});
		}),
	).pipe(Layer.provideMerge(platform), Layer.provideMerge(projects));
	return {
		agentDir,
		layer: SkillImportHandlersLive.pipe(Layer.provideMerge(service)),
		root,
		skillsDir: join(agentDir, "skills"),
	};
};

/** Writes the files a fake fetch would leave in the stage tree. */
const writes =
	(files: Readonly<Record<string, string>>): SourceFetcher =>
	(_source, tree) =>
		Effect.sync(() => {
			for (const [path, text] of Object.entries(files)) {
				const target = join(tree, path);
				mkdirSync(dirname(target), { recursive: true });
				writeFileSync(target, text);
			}
		});

const encoder = new TextEncoder();

const skillText = (name: string, description: string) =>
	`---\nname: ${name}\ndescription: ${description}\n---\n\nBody\n`;

const bytes = (text: string): Uint8Array => encoder.encode(text);

const readText = (path: string): string => readFileSync(path, "utf8");

describe("config.skills.import", () => {
	test("stages a pasted source, reports the skill, and copies it into the home", async () => {
		const { agentDir, layer } = importLayer(
			"source",
			writes({ "skills/greet/SKILL.md": skillText("greet", "Say hello") }),
		);

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillImportRpcs, SkillImportHandlersLive);
				const report = yield* client["config.skills.import.stageSource"]({
					folder: null,
					input: "npx skills add owner/repo -s greet -y",
				});
				yield* client["config.skills.import.commit"]({
					commit: { mode: "copy", replace: [], skills: ["greet"], target: "global" },
					folder: null,
					stageId: report.stageId,
				});
				const gone = yield* Effect.flip(
					client["config.skills.import.report"]({
						folder: null,
						stageId: report.stageId,
					}),
				);
				return { gone, report };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.report.candidates).toHaveLength(1);
		expect(result.report.candidates[0]).toMatchObject({
			description: "Say hello",
			dir: "skills/greet",
			modelInvocation: true,
			name: "greet",
		});
		expect(result.report.candidates[0]?.files.map((file) => file.path)).toEqual(["SKILL.md"]);
		expect(readText(join(agentDir, "skills", "greet", "SKILL.md"))).toContain("Say hello");
		expect(result.gone).toBeInstanceOf(StageGone);
	});

	test("a missing description is an error, and a source with no SKILL.md stages nothing", async () => {
		const { layer } = importLayer(
			"invalid",
			writes({
				"skills/nodesc/SKILL.md": "---\nname: nodesc\n---\n\nBody\n",
				"empty/readme.md": "No skill here\n",
			}),
		);

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillImportRpcs, SkillImportHandlersLive);
				const report = yield* client["config.skills.import.stageSource"]({
					folder: null,
					input: "owner/repo",
				});
				const refused = yield* Effect.flip(
					client["config.skills.import.commit"]({
						commit: {
							mode: "copy",
							replace: [],
							skills: ["nodesc"],
							target: "global",
						},
						folder: null,
						stageId: report.stageId,
					}),
				);
				yield* client["config.skills.import.discard"]({
					folder: null,
					stageId: report.stageId,
				});
				return { refused, report };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.report.candidates[0]?.errors.map((issue) => issue.code)).toContain("description");
		expect(result.refused).toBeInstanceOf(ImportFailed);
		expect(result.refused).toMatchObject({ reason: expect.stringContaining("description") });
	});

	test("an empty source is refused before anything is committed", async () => {
		const { layer } = importLayer("empty", writes({ "readme.md": "Nope\n" }));
		const failure = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillImportRpcs, SkillImportHandlersLive);
				return yield* Effect.flip(
					client["config.skills.import.stageSource"]({ folder: null, input: "owner/repo" }),
				);
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);
		expect(failure).toBeInstanceOf(ImportFailed);
		expect(failure.reason).toContain("No SKILL.md");
	});

	test("an uploaded folder and a zip archive both stage their skills", async () => {
		const { agentDir, layer } = importLayer("upload", writes({}));
		const zip = zipSync({
			"zipped/SKILL.md": bytes(skillText("zipped", "From a zip")),
		});

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillImportRpcs, SkillImportHandlersLive);
				const folder = yield* client["config.skills.import.stageUpload"]({
					files: [
						{ bytes: bytes(skillText("picked", "From a folder")), name: "picked/SKILL.md" },
						{
							bytes: bytes("# Reference\n"),
							name: "picked/references/notes.md",
						},
					],
					folder: null,
				});
				yield* client["config.skills.import.commit"]({
					commit: { mode: "copy", replace: [], skills: ["picked"], target: "global" },
					folder: null,
					stageId: folder.stageId,
				});
				const archive = yield* client["config.skills.import.stageUpload"]({
					files: [{ bytes: zip, name: "skills.zip" }],
					folder: null,
				});
				yield* client["config.skills.import.commit"]({
					commit: { mode: "copy", replace: [], skills: ["zipped"], target: "global" },
					folder: null,
					stageId: archive.stageId,
				});
				return { archive, folder };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.folder.candidates[0]?.files.map((file) => file.path).toSorted()).toEqual([
			"SKILL.md",
			"references/notes.md",
		]);
		expect(result.archive.candidates[0]?.name).toBe("zipped");
		expect(readText(join(agentDir, "skills", "picked", "references", "notes.md"))).toContain(
			"Reference",
		);
		expect(readText(join(agentDir, "skills", "zipped", "SKILL.md"))).toContain("From a zip");
	});

	test("an existing skill is reported and refused until the commit replaces it", async () => {
		const { agentDir, layer } = importLayer(
			"replace",
			writes({ "skills/greet/SKILL.md": skillText("greet", "New description") }),
		);
		mkdirSync(join(agentDir, "skills", "greet"), { recursive: true });
		writeFileSync(join(agentDir, "skills", "greet", "SKILL.md"), skillText("greet", "Old"));

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillImportRpcs, SkillImportHandlersLive);
				const report = yield* client["config.skills.import.stageSource"]({
					folder: null,
					input: "owner/repo",
				});
				const refused = yield* Effect.flip(
					client["config.skills.import.commit"]({
						commit: { mode: "copy", replace: [], skills: ["greet"], target: "global" },
						folder: null,
						stageId: report.stageId,
					}),
				);
				yield* client["config.skills.import.commit"]({
					commit: {
						mode: "copy",
						replace: ["greet"],
						skills: ["greet"],
						target: "global",
					},
					folder: null,
					stageId: report.stageId,
				});
				return { refused, report, text: readText(join(agentDir, "skills", "greet", "SKILL.md")) };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.report.candidates[0]?.existing).toEqual({ global: true, project: false });
		expect(result.report.candidates[0]?.warnings.map((issue) => issue.code)).toContain(
			"already-installed",
		);
		expect(result.refused).toBeInstanceOf(ImportFailed);
		expect(result.refused).toMatchObject({ reason: expect.stringContaining("already installed") });
		expect(result.text).toContain("New description");
	});

	test("a project target needs trust, then writes into its .agents/skills", async () => {
		const { agentDir, layer, root } = importLayer(
			"project",
			writes({ "skills/team/SKILL.md": skillText("team", "For the project") }),
		);
		const project = join(root, "project");
		mkdirSync(join(project, ".pi"), { recursive: true });
		writeFileSync(join(project, ".pi", "mcp.json"), "{}\n");
		const untrusted = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillImportRpcs, SkillImportHandlersLive);
				return yield* Effect.flip(
					client["config.skills.import.stageSource"]({
						folder: project,
						input: "owner/repo",
					}),
				);
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);
		expect(untrusted).toBeInstanceOf(ImportFailed);
		expect(untrusted).toMatchObject({ reason: expect.stringContaining("not trusted") });

		writeFileSync(join(agentDir, "trust.json"), JSON.stringify({ [realpathSync(project)]: true }));
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillImportRpcs, SkillImportHandlersLive);
				const report = yield* client["config.skills.import.stageSource"]({
					folder: project,
					input: "owner/repo",
				});
				yield* client["config.skills.import.commit"]({
					commit: { mode: "copy", replace: [], skills: ["team"], target: "project" },
					folder: project,
					stageId: report.stageId,
				});
				return { report };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);
		expect(result.report.candidates[0]?.name).toBe("team");
		expect(
			readText(join(realpathSync(project), ".agents", "skills", "team", "SKILL.md")),
		).toContain("For the project");
	});

	test("a source that is not an install command, and a package commit, are refused", async () => {
		const { layer } = importLayer(
			"refusals",
			writes({ "skills/greet/SKILL.md": skillText("greet", "Say hello") }),
		);
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* testClient(SkillImportRpcs, SkillImportHandlersLive);
				const parse = yield* Effect.flip(
					client["config.skills.import.stageSource"]({
						folder: null,
						input: "curl https://example.test",
					}),
				);
				const report = yield* client["config.skills.import.stageSource"]({
					folder: null,
					input: "owner/repo",
				});
				const packageMode = yield* Effect.flip(
					client["config.skills.import.commit"]({
						commit: {
							mode: "package",
							replace: [],
							skills: ["greet"],
							target: "global",
						},
						folder: null,
						stageId: report.stageId,
					}),
				);
				yield* client["config.skills.import.discard"]({ folder: null, stageId: report.stageId });
				const discarded = yield* Effect.flip(
					client["config.skills.import.report"]({ folder: null, stageId: report.stageId }),
				);
				return { discarded, packageMode, parse, report };
			}).pipe(Effect.scoped, Effect.provide(layer)),
		);

		expect(result.parse).toBeInstanceOf(ImportFailed);
		expect(result.parse).toMatchObject({ reason: expect.stringContaining("different command") });
		expect(result.report.packageOption.available).toBe(false);
		expect(result.packageMode).toBeInstanceOf(ImportFailed);
		expect(result.packageMode).toMatchObject({
			reason: expect.stringContaining("cannot be installed as a package"),
		});
		expect(result.discarded).toBeInstanceOf(StageGone);
	});
});
