import { resolve } from "node:path";

import { Context, Effect, FileSystem, Layer, Option, Schema } from "effect";

import type { ProjectNotTrusted, ProjectRefused, SkillRefused } from "#protocol/errors";
import type { ContextProblem, ContextView } from "#protocol/settings/context";
import { ContextEngineLive } from "#protocol/settings/context";
import type { SkillView } from "#protocol/settings/skills";

import { Engines } from "../../conversation/registry.ts";
import { AgentHome } from "../../platform/agent-home.ts";
import type { AgentHomeApi } from "../../platform/agent-home.ts";
import { PiConfig } from "../../platform/pi.ts";
import type { PiConfigApi } from "../../platform/pi.ts";
import { ProjectService } from "../projects/service.ts";
import { SkillsService } from "../skills/service.ts";
import type { SkillsServiceApi } from "../skills/service.ts";
import { readContextFiles } from "./store.ts";

/**
 * One context read: what the files decide, plus what a live engine in that folder knows.
 *
 * The files answer with no chat open. The exact prompt, the tool set and the token usage
 * belong to an engine, so they are filled only where one is open and `live` says which
 * answer the page is showing. A folder must be trusted before its `.pi` is read.
 */

const failure = (kind: ContextProblem["kind"], message: string, path?: string): ContextProblem =>
	path === undefined ? { kind, message } : { kind, message, path };

/**
 * Why a skill pi listed will not do what its file says: pi refused it, another file took
 * its name, or a field it wrote is ignored. A skill the operator switched off is a choice,
 * not a problem.
 */
const skillProblems = (skills: ReadonlyArray<SkillView>): ContextProblem[] =>
	skills.flatMap((skill) => {
		if (skill.status === "invalid") {
			return [failure("skill", skill.message ?? "pi could not load this skill", skill.filePath)];
		}
		if (skill.status === "shadowed") {
			return [
				failure(
					"skill",
					`pi uses ${skill.shadowedBy ?? "another file"} for this name`,
					skill.filePath,
				),
			];
		}
		return skill.warnings.map((message) => failure("skill", message, skill.filePath));
	});

export type ContextServiceApi = {
	readonly read: (
		folder: string | null,
	) => Effect.Effect<ContextView, ProjectNotTrusted | ProjectRefused | SkillRefused>;
};

export class ContextService extends Context.Service<ContextService, ContextServiceApi>()(
	"epsilon/ContextService",
) {}

export const makeContextService = (deps: {
	readonly home: AgentHomeApi;
	readonly fs: FileSystem.FileSystem;
	readonly pi: PiConfigApi;
	readonly skills: SkillsServiceApi;
	readonly trust: (folder: string) => Effect.Effect<string, ProjectNotTrusted | ProjectRefused>;
	readonly live: (cwd: string) => Effect.Effect<ReadonlyArray<ContextEngineLive>>;
}): ContextServiceApi => {
	const read: ContextServiceApi["read"] = Effect.fn("Context.read")(function* (folder) {
		// The home scope is read where a home chat runs, which is `<agent>/chats`: `.epsilon` is
		// Epsilon's own folder, and no engine runs there, so a live lookup against it never fits
		// and a home chat's own AGENTS.md would not be in the answer.
		const cwd = folder === null ? deps.home.chatsDir : yield* deps.trust(folder);
		const project = folder === null ? null : cwd;
		const files = yield* readContextFiles({
			context: deps.pi.context(cwd),
			cwd,
			fs: deps.fs,
			home: deps.home,
			packages: deps.pi.packages(cwd),
		});
		const skillList = yield* deps.skills.list(folder);
		const live = (yield* deps.live(cwd))[0];
		const settingsProblems = yield* deps.pi.settingsProblems(cwd);
		const view: ContextView = {
			folder: cwd,
			project,
			live: live !== undefined,
			contextFiles: [...files.contextFiles],
			systemPrompt:
				live === undefined
					? files.systemPrompt
					: { ...files.systemPrompt, text: live.systemPrompt },
			skills: [...skillList.skills],
			prompts: [...files.prompts],
			extensions: [...files.extensions],
			packages: [...files.packages],
			problems: [
				...files.problems,
				...settingsProblems.map((problem) => failure("settings", problem.message, problem.path)),
				...skillProblems(skillList.skills),
				...files.extensions.flatMap((extension) =>
					extension.errors
						.map((message) => failure("extension", message, extension.path))
						.concat(
							extension.warnings.map((message) => failure("extension", message, extension.path)),
						),
				),
			],
		};
		if (live === undefined) return view;
		const withLive: ContextView = {
			...view,
			liveSessionId: live.sessionId,
			tools: live.tools,
		};
		return live.contextUsage === undefined
			? withLive
			: { ...withLive, contextUsage: live.contextUsage };
	});
	return { read };
};

export const ContextServiceLive: Layer.Layer<
	ContextService,
	never,
	AgentHome | PiConfig | SkillsService | ProjectService | Engines | FileSystem.FileSystem
> = Layer.effect(
	ContextService,
	Effect.gen(function* () {
		const home = yield* AgentHome;
		const pi = yield* PiConfig;
		const skills = yield* SkillsService;
		const projects = yield* ProjectService;
		const engines = yield* Engines;
		const fs = yield* FileSystem.FileSystem;
		const live = (cwd: string): Effect.Effect<ReadonlyArray<ContextEngineLive>> =>
			engines.queryAll("contextLive").pipe(
				Effect.map((rows) =>
					rows
						.filter((row) => resolve(row.cwd) === resolve(cwd))
						.flatMap((row) => {
							const decoded = Schema.decodeUnknownOption(ContextEngineLive)(row.result);
							return Option.isNone(decoded) ? [] : [decoded.value];
						}),
				),
			);
		return makeContextService({
			fs,
			home,
			live,
			pi,
			skills,
			trust: (folder) => projects.trusted(folder),
		});
	}),
);
