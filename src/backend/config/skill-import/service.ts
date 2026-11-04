import { join } from "node:path";

import { Clock, Context, Effect, FileSystem, Layer } from "effect";

import type {
	SkillImportCandidate,
	SkillImportCommit,
	SkillImportPackageOption,
	SkillImportReport,
	SkillImportUploadFile,
} from "#protocol/config/skill-import";
import { ImportFailed } from "#protocol/errors";
import type { ProjectNotTrusted, ProjectRefused, StageGone } from "#protocol/errors";

import { archiveKindOf, readArchive } from "../../../domain/skills/archive.ts";
import type { ArchiveEntry } from "../../../domain/skills/archive.ts";
import { discoverSkillDirs, parseImportInput } from "../../../domain/skills/import.ts";
import type { ImportSource } from "../../../domain/skills/import.ts";
import { IMPORT_MAX_UPLOAD_BYTES, isSkillName } from "../../../domain/skills/rules.ts";
import { AgentHome } from "../../platform/agent-home.ts";
import type { AgentHomeApi } from "../../platform/agent-home.ts";
import { ProjectService } from "../projects/service.ts";
import { homeSkillsDir, projectAgentsSkillsDir, projectSkillsDir } from "../skills/inventory.ts";
import { skillsCli } from "./cli.ts";
import { flagDuplicateNames, inspectCandidate } from "./domain.ts";
import type { TreeFile } from "./domain.ts";
import {
	createStage,
	discardStage,
	installFolders,
	listTree,
	packageOptionUnavailable,
	pruneTree,
	readTreeText,
	requireStage,
	saveStage,
	skillFolderExists,
	stagePaths,
	writeEntries,
} from "./store.ts";
import type { StageFile } from "./store.ts";

/**
 * One pipeline for every source: source, staging folder, discovery, strict validation,
 * a report, and then a commit that moves the chosen skills into place. The report is
 * rebuilt from the staged files each time it is needed, so what the person approved is
 * what is checked again at commit.
 *
 * A repository can be copied as skills; installing it as a package needs the repository
 * probe and is not available yet, so `packageOption` says so instead of guessing.
 */

/** Fetches one parsed source into a stage's tree; replaceable so tests never touch a CLI. */
export type SourceFetcher = (
	source: ImportSource,
	tree: string,
) => Effect.Effect<void, ImportFailed>;

/** The report of one stage; the same shape from a fresh stage and from a re-read. */
const reportOf = (
	stageId: string,
	stage: StageFile,
	candidates: ReadonlyArray<SkillImportCandidate>,
): SkillImportReport => ({
	stageId,
	source: stage.source,
	candidates: [...candidates],
	packageOption: stage.packageOption,
});

/** Where an import reads its settings and lands its skills. */
type ImportContext = {
	readonly project: string | null;
};

const failure = (reason: string, source?: string): ImportFailed =>
	new ImportFailed(source === undefined ? { reason } : { reason, source });

const sourceNameOf = (files: ReadonlyArray<SkillImportUploadFile>): string => {
	const only = files[0];
	if (files.length === 1 && only !== undefined) return only.name;
	const top = only?.name.split("/")[0];
	return top === undefined || top === "" || files.some((file) => !file.name.startsWith(`${top}/`))
		? "Uploaded folder"
		: `${top} (folder)`;
};

const under = (dir: string, path: string): string | undefined => {
	if (dir === "") return path;
	return path.startsWith(`${dir}/`) ? path.slice(dir.length + 1) : undefined;
};

export type SkillImportServiceApi = {
	readonly stageSource: (
		folder: string | null,
		input: string,
	) => Effect.Effect<SkillImportReport, ImportFailed>;
	readonly stageUpload: (
		folder: string | null,
		files: ReadonlyArray<SkillImportUploadFile>,
	) => Effect.Effect<SkillImportReport, ImportFailed>;
	readonly report: (
		folder: string | null,
		stageId: string,
	) => Effect.Effect<SkillImportReport, ImportFailed | StageGone>;
	readonly commit: (
		folder: string | null,
		stageId: string,
		commit: SkillImportCommit,
	) => Effect.Effect<void, ImportFailed | StageGone>;
	readonly discard: (folder: string | null, stageId: string) => Effect.Effect<void>;
};

export class SkillImportService extends Context.Service<
	SkillImportService,
	SkillImportServiceApi
>()("epsilon/SkillImportService") {}

export const makeSkillImportService = (deps: {
	readonly home: AgentHomeApi;
	readonly fs: FileSystem.FileSystem;
	readonly trusted: (path: string) => Effect.Effect<string, ProjectNotTrusted | ProjectRefused>;
	readonly fetchSource: SourceFetcher;
}): SkillImportServiceApi => {
	const contextOf = (folder: string | null): Effect.Effect<ImportContext, ImportFailed> =>
		folder === null
			? Effect.succeed({ project: null })
			: deps.trusted(folder).pipe(
					Effect.map((project) => ({ project })),
					Effect.catchTags({
						ProjectNotTrusted: (error) =>
							Effect.fail(
								failure(
									`${error.path} is not trusted yet. Trust the folder before importing into it.`,
								),
							),
						ProjectRefused: (error) => Effect.fail(failure(error.reason, error.path)),
					}),
				);

	const targetRoot = (
		context: ImportContext,
		target: SkillImportCommit["target"],
	): Effect.Effect<string, ImportFailed> => {
		if (target === "global") return Effect.succeed(homeSkillsDir(deps.home));
		return context.project === null
			? Effect.fail(failure("Pick a project to import into its .agents/skills"))
			: Effect.succeed(projectAgentsSkillsDir(context.project));
	};

	/** Where a same-named skill would already be found: the home, and the project's roots. */
	const existingIn = (
		context: ImportContext,
		name: string,
	): Effect.Effect<SkillImportCandidate["existing"]> =>
		Effect.gen(function* () {
			if (!isSkillName(name)) return { global: false, project: false };
			const global = yield* skillFolderExists(deps.fs, homeSkillsDir(deps.home), name);
			if (context.project === null) return { global, project: false };
			const pi = yield* skillFolderExists(deps.fs, projectSkillsDir(context.project), name);
			const agents = yield* skillFolderExists(
				deps.fs,
				projectAgentsSkillsDir(context.project),
				name,
			);
			return { global, project: pi || agents };
		});

	/** Reads the staged tree and checks every skill in it. */
	const buildCandidates = (
		context: ImportContext,
		stageId: string,
		stage: StageFile,
	): Effect.Effect<ReadonlyArray<SkillImportCandidate>, ImportFailed> =>
		Effect.gen(function* () {
			const { tree } = stagePaths(deps.home, stageId);
			const { files, links } = yield* listTree(deps.fs, tree);
			const candidates = yield* Effect.forEach(
				[...new Set(discoverSkillDirs(files.map((file) => file.path)))],
				(dir) =>
					Effect.gen(function* () {
						const own: TreeFile[] = files.flatMap((file) => {
							const path = under(dir, file.path);
							return path === undefined ? [] : [{ ...file, path }];
						});
						const skillFile = own.some((file) => file.path === "SKILL.md")
							? yield* readTreeText(deps.fs, tree, dir === "" ? "SKILL.md" : `${dir}/SKILL.md`)
							: undefined;
						const input = {
							dir,
							files: own,
							links: [
								...links,
								...stage.skipped
									.filter((item) => item.reason === "symlink")
									.map((item) => item.path),
							].flatMap((path) => under(dir, path) ?? []),
							skillFile,
							removed: stage.skipped
								.filter((item) => item.reason === "stripped")
								.flatMap((item) => under(dir, item.path) ?? []),
							existing: { global: false, project: false },
						};
						const first = inspectCandidate(input);
						return inspectCandidate({
							...input,
							existing: yield* existingIn(context, first.name),
						});
					}),
				{ concurrency: 4 },
			);
			return flagDuplicateNames(candidates);
		});

	/** Records a freshly filled stage and answers its report, or removes it when empty. */
	const finishStage = (
		context: ImportContext,
		stageId: string,
		stage: StageFile,
	): Effect.Effect<SkillImportReport, ImportFailed> =>
		Effect.gen(function* () {
			const candidates = yield* buildCandidates(context, stageId, stage);
			if (candidates.length === 0) {
				return yield* failure(
					"No SKILL.md was found in that source, so there is no skill to import",
				);
			}
			yield* saveStage(deps.fs, deps.home, stageId, stage);
			return reportOf(stageId, stage, candidates);
		});

	/** Runs a staging step; on any failure the half-made stage is deleted. */
	const staged = (
		context: ImportContext,
		fill: (tree: string) => Effect.Effect<StageFile, ImportFailed>,
	): Effect.Effect<SkillImportReport, ImportFailed> =>
		Effect.gen(function* () {
			const { stageId, tree } = yield* createStage(deps.fs, deps.home);
			return yield* fill(tree).pipe(
				Effect.flatMap((stage) => finishStage(context, stageId, stage)),
				Effect.onError(() => discardStage(deps.fs, deps.home, stageId)),
			);
		});

	const uploadOption: SkillImportPackageOption = packageOptionUnavailable(
		"An uploaded folder or archive is copied; there is no repository for pi to install",
	);
	const sourceOption: SkillImportPackageOption = packageOptionUnavailable(
		"A repository can be copied as skills; installing it as a package is not available yet",
	);

	const stageUpload: SkillImportServiceApi["stageUpload"] = Effect.fn("SkillImport.stageUpload")(
		function* (folder, files) {
			const context = yield* contextOf(folder);
			if (files.length === 0) return yield* failure("No files were uploaded");
			const total = files.reduce((sum, file) => sum + file.bytes.length, 0);
			if (total > IMPORT_MAX_UPLOAD_BYTES) {
				return yield* failure(
					`The upload is ${Math.ceil(total / 1024 / 1024)} MB; the limit is ${IMPORT_MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
				);
			}
			const only = files[0];
			return yield* staged(context, (tree) =>
				Effect.gen(function* () {
					const archive =
						files.length === 1 &&
						only !== undefined &&
						(/\.(zip|tar|tgz|tar\.gz)$/i.test(only.name) ||
							archiveKindOf(only.name, only.bytes) !== undefined)
							? only
							: undefined;
					const entries =
						archive === undefined
							? files.map((file) => ({
									path: file.name,
									kind: "file" as const,
									bytes: file.bytes,
									mode: undefined,
								}))
							: yield* readArchiveEffect(archive.name, archive.bytes);
					const now = yield* Clock.currentTimeMillis;
					return {
						source: sourceNameOf(files),
						createdAt: now,
						skipped: yield* writeEntries(deps.fs, tree, entries),
						packageOption: uploadOption,
					} satisfies StageFile;
				}),
			);
		},
	);

	const stageSource: SkillImportServiceApi["stageSource"] = Effect.fn("SkillImport.stageSource")(
		function* (folder, input) {
			const context = yield* contextOf(folder);
			const parsed = parseImportInput(input);
			if (!parsed.ok) return yield* failure(parsed.reason);
			return yield* staged(context, (tree) =>
				Effect.gen(function* () {
					yield* deps.fetchSource(parsed.source, tree);
					const now = yield* Clock.currentTimeMillis;
					return {
						source: parsed.source.source,
						cliSource: parsed.source.source,
						createdAt: now,
						skipped: yield* pruneTree(deps.fs, tree),
						packageOption: sourceOption,
					} satisfies StageFile;
				}),
			);
		},
	);

	const report: SkillImportServiceApi["report"] = Effect.fn("SkillImport.report")(
		function* (folder, stageId) {
			const context = yield* contextOf(folder);
			const stage = yield* requireStage(deps.fs, deps.home, stageId);
			return reportOf(stageId, stage, yield* buildCandidates(context, stageId, stage));
		},
	);

	const commit: SkillImportServiceApi["commit"] = Effect.fn("SkillImport.commit")(
		function* (folder, stageId, body) {
			const context = yield* contextOf(folder);
			const stage = yield* requireStage(deps.fs, deps.home, stageId);
			const candidates = yield* buildCandidates(context, stageId, stage);
			const chosen = body.skills.map((name) => {
				const candidate = candidates.find((item) => item.name === name);
				if (candidate === undefined) {
					return { problem: `${name} is not one of the skills in this source` };
				}
				const [problem] = candidate.errors;
				return problem === undefined
					? { candidate }
					: { problem: `${name} cannot be imported: ${problem.message}` };
			});
			const refused = chosen.find((item) => "problem" in item);
			if (refused !== undefined) {
				const problem = "problem" in refused ? refused.problem : "the skill was refused";
				return yield* failure(problem);
			}

			if (body.mode === "package") {
				return yield* failure(
					`This source cannot be installed as a package. ${stage.packageOption.reason}`,
				);
			}
			const root = yield* targetRoot(context, body.target);
			const names = chosen.flatMap((item) => ("candidate" in item ? [item.candidate.name] : []));
			const replace = new Set(body.replace);
			for (const name of names) {
				const exists = yield* skillFolderExists(deps.fs, root, name);
				if (exists && !replace.has(name)) {
					return yield* failure(
						`A skill named ${name} is already installed there. Choose to replace it, or leave it out`,
					);
				}
			}
			const { tree } = stagePaths(deps.home, stageId);
			yield* installFolders(
				deps.fs,
				root,
				chosen.flatMap((item) =>
					"candidate" in item
						? [{ from: join(tree, item.candidate.dir), name: item.candidate.name }]
						: [],
				),
				replace,
			);
			yield* discardStage(deps.fs, deps.home, stageId);
			return undefined;
		},
	);

	const discard: SkillImportServiceApi["discard"] = Effect.fn("SkillImport.discard")(
		function* (_folder, stageId) {
			yield* discardStage(deps.fs, deps.home, stageId);
			return undefined;
		},
	);

	return { commit, discard, report, stageSource, stageUpload };
};

/** An archive's entries, or the one sentence that says why it is not one. */
const readArchiveEffect = (
	name: string,
	bytes: Uint8Array,
): Effect.Effect<ReadonlyArray<ArchiveEntry>, ImportFailed> =>
	Effect.try({
		try: () => readArchive(name, bytes),
		catch: (cause) => failure(cause instanceof Error ? cause.message : String(cause)),
	});

export const SkillImportServiceLive = (
	env: Readonly<Record<string, string>>,
): Layer.Layer<SkillImportService, never, AgentHome | ProjectService | FileSystem.FileSystem> =>
	Layer.effect(
		SkillImportService,
		Effect.gen(function* () {
			const home = yield* AgentHome;
			const projects = yield* ProjectService;
			const fs = yield* FileSystem.FileSystem;
			const fetchSource: SourceFetcher = (source, tree) =>
				skillsCli(
					{ skills: [...source.skills], source: source.source },
					{
						cwd: tree,
						env,
						timeoutMs: 120_000,
						userHome: home.userHome,
					},
				).pipe(Effect.asVoid);
			return makeSkillImportService({
				fetchSource,
				fs,
				home,
				trusted: (path) => projects.trusted(path),
			});
		}),
	);
