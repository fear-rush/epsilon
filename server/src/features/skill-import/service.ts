/**
 * One pipeline for every source: source, staging folder, discovery, strict
 * validation, a report, and then a commit that moves the chosen skills into
 * place. The report is rebuilt from the staged files each time it is needed, so
 * what the person approved is what is checked again at commit.
 */
import { join } from "node:path";

import { IMPORT_MAX_UPLOAD_BYTES, skillNameSchema } from "shared";
import { z } from "zod";

import type { AgentHome } from "../../platform/agent-home";
import { packageManager, settingsManager } from "../../platform/pi";
import type { SettingsManager } from "../../platform/pi";
import { settingsFolder } from "../projects";
import { skillRootDir } from "../skills";
import { archiveKindOf, readArchive } from "./archive";
import type { ArchiveEntry } from "./archive";
import { runSkillsCli } from "./cli";
import type { SourceFetcher } from "./cli";
import type { Candidate, CommitBody, ImportReport, PackageOption, StageFile } from "./contract";
import { discoverSkillDirs, flagDuplicateNames, inspectCandidate } from "./domain";
import { fetchGithubPaths, packageOptionFor } from "./repo";
import type { RepoProbe } from "./repo";
import { parseImportInput } from "./source";
import {
	createStage,
	discardStage,
	installFolders,
	listTree,
	loadStage,
	pruneTree,
	readTreeText,
	saveStage,
	skillFolderExists,
	stagePaths,
	writeEntries,
} from "./store";

/** What the pipeline reaches over the network; tests replace both. */
export type ImportPorts = { fetchSource: SourceFetcher; probeRepo: RepoProbe };

export const livePorts: ImportPorts = { fetchSource: runSkillsCli, probeRepo: fetchGithubPaths };

/** Where an import reads and writes, resolved by the route before the service runs. */
export type ImportContext = {
	home: AgentHome;
	/** The folder that stands for `~`, for the fetcher's `HOME`. */
	userHome: string;
	/** The project the person picked, as the browser named it; it must be trusted. */
	project: string | undefined;
};

/** The stage is gone: expired, discarded, or never finished. */
export class StageGoneError extends Error {
	constructor() {
		super("This import has expired. Choose the source again");
	}
}

const targetRoot = (context: ImportContext, target: CommitBody["target"]): Promise<string> =>
	skillRootDir(context.home, context.project, target === "global" ? "home" : "project-agents");

/** Where a same-named skill would already be found: the home, and the project's two roots. */
const existingIn = async (context: ImportContext, name: string): Promise<Candidate["existing"]> => {
	if (!skillNameSchema.safeParse(name).success) return { global: false, project: false };
	const { home, project } = context;
	const projectRoots =
		project === undefined
			? []
			: await Promise.all([
					skillRootDir(home, project, "project-pi"),
					skillRootDir(home, project, "project-agents"),
				]);
	const [global, ...inProject] = await Promise.all([
		skillFolderExists(home.skillsDir, name),
		...projectRoots.map((root) => skillFolderExists(root, name)),
	]);
	return { global, project: inProject.some(Boolean) };
};

const under = (dir: string, path: string): string | undefined => {
	if (dir === "") return path;
	return path.startsWith(`${dir}/`) ? path.slice(dir.length + 1) : undefined;
};

/** Reads the staged tree and checks every skill in it. */
const buildCandidates = async (
	context: ImportContext,
	stageId: string,
	stage: StageFile,
): Promise<Candidate[]> => {
	const { tree } = stagePaths(context.home, stageId);
	const { files, links } = await listTree(tree);
	const skipped = stage.skipped;
	const candidates: Candidate[] = [];
	for (const dir of discoverSkillDirs(files.map((file) => file.path))) {
		const own = files.flatMap((file) => {
			const path = under(dir, file.path);
			return path === undefined ? [] : [{ ...file, path }];
		});
		const input = {
			dir,
			files: own,
			links: [
				...links,
				...skipped.filter((item) => item.reason === "symlink").map((item) => item.path),
			].flatMap((path) => under(dir, path) ?? []),
			skillFile: own.some((file) => file.path === "SKILL.md")
				? await readTreeText(tree, dir === "" ? "SKILL.md" : `${dir}/SKILL.md`)
				: undefined,
			removed: skipped
				.filter((item) => item.reason === "stripped")
				.flatMap((item) => under(dir, item.path) ?? []),
			existing: { global: false, project: false },
		};
		const first = inspectCandidate(input);
		candidates.push(
			inspectCandidate({ ...input, existing: await existingIn(context, first.name) }),
		);
	}
	return flagDuplicateNames(candidates);
};

const reportOf = (stageId: string, stage: StageFile, candidates: Candidate[]): ImportReport => ({
	stageId,
	source: stage.source,
	candidates,
	packageOption: stage.packageOption,
});

/** Records a freshly filled stage and answers its report, or removes it when it holds no skill. */
const finishStage = async (
	context: ImportContext,
	stageId: string,
	stage: StageFile,
): Promise<ImportReport> => {
	const candidates = await buildCandidates(context, stageId, stage);
	if (candidates.length === 0) {
		throw new Error("No SKILL.md was found in that source, so there is no skill to import");
	}
	await saveStage(context.home, stageId, stage);
	return reportOf(stageId, stage, candidates);
};

/** Runs a staging step; on any failure the half-made stage is deleted. */
const staged = async (
	context: ImportContext,
	fill: (tree: string) => Promise<StageFile>,
): Promise<ImportReport> => {
	const { stageId, tree } = await createStage(context.home);
	try {
		return await finishStage(context, stageId, await fill(tree));
	} catch (error) {
		await discardStage(context.home, stageId);
		throw error;
	}
};

const NO_PACKAGE_UPLOAD: PackageOption = {
	available: false,
	reason: "An uploaded folder or archive is copied; there is no repository for pi to install",
};

/** One uploaded file; a folder upload names each by its path inside the picked folder. */
export type UploadedFile = { name: string; bytes: Uint8Array };

const ARCHIVE_NAME = /\.(zip|tar|tgz|tar\.gz)$/i;

const sourceNameOf = (files: readonly UploadedFile[]): string => {
	const [only] = files;
	if (files.length === 1 && only !== undefined) return only.name;
	const top = files[0]?.name.split("/")[0];
	return top === undefined || top === "" || files.some((file) => !file.name.startsWith(`${top}/`))
		? "Uploaded folder"
		: `${top} (folder)`;
};

/** Stages a picked folder's files, or one archive. */
export const stageUpload = (
	context: ImportContext,
	files: readonly UploadedFile[],
): Promise<ImportReport> => {
	if (files.length === 0) return Promise.reject(new Error("No files were uploaded"));
	const total = files.reduce((sum, file) => sum + file.bytes.length, 0);
	if (total > IMPORT_MAX_UPLOAD_BYTES) {
		return Promise.reject(
			new Error(
				`The upload is ${Math.ceil(total / 1024 / 1024)} MB; the limit is ${IMPORT_MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
			),
		);
	}
	return staged(context, async (tree) => {
		const [only] = files;
		const isArchive =
			files.length === 1 &&
			only !== undefined &&
			(ARCHIVE_NAME.test(only.name) || archiveKindOf(only.name, only.bytes) !== undefined);
		const entries: ArchiveEntry[] =
			isArchive && only !== undefined
				? readArchive(only.name, only.bytes)
				: files.map((file) => ({
						path: file.name,
						kind: "file",
						bytes: file.bytes,
						mode: undefined,
					}));
		return {
			source: sourceNameOf(files),
			createdAt: Date.now(),
			skipped: await writeEntries(tree, entries),
			packageOption: NO_PACKAGE_UPLOAD,
		};
	});
};

/** Stages a pasted command or source by running the `skills` CLI into the stage. */
export const stageSource = async (
	context: ImportContext,
	input: string,
	ports: ImportPorts = livePorts,
): Promise<ImportReport> => {
	const parsed = parseImportInput(input);
	return staged(context, async (tree) => {
		const option = packageOptionFor(parsed.source, ports.probeRepo);
		try {
			await ports.fetchSource(parsed, tree, context.userHome);
		} catch (error) {
			void option.catch(() => undefined);
			throw error;
		}
		return {
			source: parsed.source,
			cliSource: parsed.source,
			createdAt: Date.now(),
			skipped: await pruneTree(tree),
			packageOption: await option,
		};
	});
};

/** Throws `StageGoneError` unless the stage is still on disk. */
export const requireStage = async (context: ImportContext, stageId: string): Promise<void> => {
	if ((await loadStage(context.home, stageId)) === undefined) throw new StageGoneError();
};

/** The same report again, for a stage that is still on disk. */
export const stageReport = async (
	context: ImportContext,
	stageId: string,
): Promise<ImportReport> => {
	const stage = await loadStage(context.home, stageId);
	if (stage === undefined) throw new StageGoneError();
	return reportOf(stageId, stage, await buildCandidates(context, stageId, stage));
};

export const discard = (context: ImportContext, stageId: string): Promise<void> =>
	discardStage(context.home, stageId);

/** A package entry as pi stores it: a bare source, or an object with filters. */
const packageEntrySchema = z.union([
	z.string().transform((source) => ({ source })),
	z.looseObject({ source: z.string() }),
]);

/** A repository's identity without its scheme, `.git` or `@ref`, so spellings compare equal. */
const repoKey = (source: string): string =>
	source
		.replace(/^(git:|https?:\/\/|ssh:\/\/|git@)/, "")
		.replace(/:/, "/")
		.replace(/@[^/]*$/, "")
		.replace(/\.git$/, "")
		.toLowerCase();

/**
 * Narrows a declared package to the chosen skills. pi's `skills` filter in a
 * package entry matches a skill by its folder name, and an entry without one
 * enables every skill the package holds.
 */
export const restrictPackageSkills = async (
	settings: SettingsManager,
	source: string,
	names: readonly string[],
	local: boolean,
): Promise<void> => {
	const declared =
		(local ? settings.getProjectSettings() : settings.getGlobalSettings()).packages ?? [];
	const entries = declared.map((entry) => packageEntrySchema.parse(entry));
	const index = entries.findIndex((entry) => repoKey(entry.source) === repoKey(source));
	const found = entries[index];
	if (found === undefined) {
		throw new Error(
			"pi installed the package but did not declare it, so every skill in it is enabled. Remove it under Packages and try again",
		);
	}
	const next = [...declared];
	next[index] = { ...found, skills: [...names] };
	if (local) settings.setProjectPackages(next);
	else settings.setPackages(next);
	await settings.flush();
};

const installAsPackage = async (
	context: ImportContext,
	stage: StageFile,
	body: CommitBody,
): Promise<void> => {
	const { packageOption } = stage;
	if (!packageOption.available || packageOption.source === undefined) {
		throw new Error(`This source cannot be installed as a package. ${packageOption.reason}`);
	}
	const local = body.target === "project";
	await targetRoot(context, body.target);
	const folder = await settingsFolder(context.home, local ? context.project : undefined);
	const settings = settingsManager(folder, context.home);
	await packageManager(folder, context.home, [], settings).installAndPersist(packageOption.source, {
		local,
	});
	await settings.flush();
	await restrictPackageSkills(settings, packageOption.source, body.skills, local);
};

/** Installs the chosen skills of a stage, then deletes the stage. */
export const commitImport = async (
	context: ImportContext,
	stageId: string,
	body: CommitBody,
): Promise<void> => {
	const stage = await loadStage(context.home, stageId);
	if (stage === undefined) throw new StageGoneError();
	const candidates = await buildCandidates(context, stageId, stage);

	const chosen = body.skills.map((name) => {
		const candidate = candidates.find((item) => item.name === name);
		if (candidate === undefined) throw new Error(`${name} is not one of the skills in this source`);
		const [problem] = candidate.errors;
		if (problem !== undefined) throw new Error(`${name} cannot be imported: ${problem.message}`);
		return candidate;
	});

	if (body.mode === "package") await installAsPackage(context, stage, body);
	else {
		const root = await targetRoot(context, body.target);
		const replace = new Set(body.replace);
		for (const { name } of chosen) {
			if (!replace.has(name) && (await skillFolderExists(root, name))) {
				throw new Error(
					`A skill named ${name} is already installed there. Choose to replace it, or leave it out`,
				);
			}
		}
		const { tree } = stagePaths(context.home, stageId);
		await installFolders(
			root,
			chosen.map((candidate) => ({ name: candidate.name, from: join(tree, candidate.dir) })),
			replace,
		);
	}
	await discardStage(context.home, stageId);
};
