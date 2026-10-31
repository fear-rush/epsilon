/**
 * Staging on disk. A stage is a folder under the agent home's `tmp/skill-import`:
 * the unpacked source in `tree/` and a small `stage.json` beside it. The folder
 * is the whole state, so a restart loses nothing and a stale stage is just an old
 * folder to delete. Every path that arrives from a browser is checked here,
 * before it is joined onto a disk path.
 */
import { randomUUID } from "node:crypto";
import {
	chmod,
	cp,
	lstat,
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";

import { isStrippedPath, skillPathProblem } from "shared";

import type { AgentHome } from "../../platform/agent-home";
import { stageFileSchema } from "./contract";
import type { StageFile } from "./contract";
import type { TreeFile } from "./domain";

/** A stage older than this is deleted when the next one is created. */
const STAGE_LIFETIME_MS = 60 * 60 * 1000;
/** More entries than this is not a skill; stop before writing thousands of files. */
const MAX_ENTRIES = 20_000;

const stagesRoot = (home: AgentHome): string => join(home.dir, "tmp", "skill-import");

export const stagePaths = (home: AgentHome, stageId: string) => {
	const dir = join(stagesRoot(home), stageId);
	return { dir, tree: join(dir, "tree"), file: join(dir, "stage.json") };
};

/** One thing to put in a stage: a file, a folder or a link from a folder or an archive. */
export type IngestEntry = {
	path: string;
	kind: "file" | "directory" | "link";
	bytes: Uint8Array;
	mode: number | undefined;
};

/** Deletes stages past their lifetime. Best effort: a stage that will not go is left. */
const sweepStages = async (home: AgentHome, now: number): Promise<void> => {
	const root = stagesRoot(home);
	const names = await readdir(root).catch((): string[] => []);
	await Promise.all(
		names.map(async (name) => {
			const info = await stat(join(root, name)).catch(() => undefined);
			if (info !== undefined && now - info.mtimeMs > STAGE_LIFETIME_MS) {
				await rm(join(root, name), { recursive: true, force: true }).catch(() => undefined);
			}
		}),
	);
};

/** A new empty stage; stale ones are swept first. */
export const createStage = async (
	home: AgentHome,
	now: number = Date.now(),
): Promise<{ stageId: string; dir: string; tree: string }> => {
	await sweepStages(home, now);
	const stageId = randomUUID();
	const { dir, tree } = stagePaths(home, stageId);
	await mkdir(tree, { recursive: true });
	return { stageId, dir, tree };
};

export const discardStage = async (home: AgentHome, stageId: string): Promise<void> => {
	await rm(stagePaths(home, stageId).dir, { recursive: true, force: true });
};

export const saveStage = async (
	home: AgentHome,
	stageId: string,
	stage: StageFile,
): Promise<void> => {
	await writeFile(stagePaths(home, stageId).file, `${JSON.stringify(stage, null, 2)}\n`);
};

/** The stage's record, or undefined when the stage is gone or was never finished. */
export const loadStage = async (
	home: AgentHome,
	stageId: string,
): Promise<StageFile | undefined> => {
	try {
		const text = await readFile(stagePaths(home, stageId).file, "utf8");
		const parsed = stageFileSchema.safeParse(JSON.parse(text));
		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
};

const inside = (path: string, parent: string): boolean => {
	const rel = relative(parent, path);
	return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

/** The shortest prefix of a path that is already a stripped path: `a/.git/x` gives `a/.git`. */
const outermostStripped = (path: string): string => {
	const parts = path.split("/");
	const at = parts.findIndex((_, index) => isStrippedPath(parts.slice(0, index + 1).join("/")));
	return parts.slice(0, at + 1).join("/");
};

/**
 * Writes entries under `tree`. A path that could leave the folder refuses the
 * whole stage: an honest bundle has none, so one is an attack or a broken tool.
 * Version control and OS litter are skipped and links are not created; both come
 * back so the report can list them.
 */
export const writeEntries = async (
	tree: string,
	entries: readonly IngestEntry[],
): Promise<StageFile["skipped"]> => {
	if (entries.length > MAX_ENTRIES) {
		throw new Error(`The source has ${entries.length} files; that is too many to be a skill`);
	}
	const skipped: StageFile["skipped"] = [];
	for (const entry of entries) {
		const path = entry.path.replace(/^(\.\/)+/, "").replace(/\/+$/, "");
		if (path === "" || path === ".") continue;
		const problem = skillPathProblem(path);
		if (problem !== undefined) throw new Error(`Refused: ${problem}`);
		if (isStrippedPath(path)) {
			const top = outermostStripped(path);
			if (!skipped.some((item) => item.path === top))
				skipped.push({ path: top, reason: "stripped" });
			continue;
		}
		if (entry.kind === "link") {
			skipped.push({ path, reason: "symlink" });
			continue;
		}
		if (entry.kind === "directory") continue;
		const target = join(tree, path);
		if (!inside(target, tree)) throw new Error(`Refused: ${path} is outside its folder`);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, entry.bytes);
		// Only the execute bit is kept: it decides whether a script is flagged.
		const executable = entry.mode !== undefined && (entry.mode & 0o111) !== 0;
		await chmod(target, executable ? 0o755 : 0o644);
	}
	return skipped;
};

/** Every file and link under `tree`, by `lstat`, so a link is seen and never followed. */
const walk = async (
	base: string,
	dir: string,
	visit: (relativePath: string, kind: "file" | "link", mode: number, size: number) => Promise<void>,
	skipStripped: boolean,
): Promise<string[]> => {
	const stripped: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		const rel = relative(base, full).split(sep).join("/");
		if (skipStripped && isStrippedPath(rel)) {
			stripped.push(rel);
			continue;
		}
		const info = await lstat(full);
		if (info.isSymbolicLink()) await visit(rel, "link", info.mode, 0);
		else if (info.isDirectory()) stripped.push(...(await walk(base, full, visit, skipStripped)));
		else if (info.isFile()) await visit(rel, "file", info.mode, info.size);
	}
	return stripped;
};

/** Removes the paths the import never installs from a tree something else filled. */
export const pruneTree = async (tree: string): Promise<StageFile["skipped"]> => {
	const stripped = await walk(tree, tree, async () => undefined, true);
	for (const path of stripped) await rm(join(tree, path), { recursive: true, force: true });
	return stripped.map((path) => ({ path, reason: "stripped" as const }));
};

/** The files of a tree and the links in it. */
export const listTree = async (tree: string): Promise<{ files: TreeFile[]; links: string[] }> => {
	const files: TreeFile[] = [];
	const links: string[] = [];
	await walk(
		tree,
		tree,
		async (path, kind, mode, size) => {
			if (kind === "link") {
				links.push(path);
				return;
			}
			const head = size === 0 ? "" : await Bun.file(join(tree, path)).slice(0, 2).text();
			files.push({ path, size, executable: (mode & 0o111) !== 0, shebang: head === "#!" });
		},
		false,
	);
	files.sort((left, right) => (left.path < right.path ? -1 : 1));
	return { files, links: links.sort() };
};

export const readTreeText = async (tree: string, path: string): Promise<string | undefined> =>
	readFile(join(tree, path), "utf8").catch(() => undefined);

/** True when the skills root already holds a folder of this name. */
export const skillFolderExists = async (root: string, name: string): Promise<boolean> =>
	(await stat(join(root, name)).catch(() => undefined))?.isDirectory() === true;

/**
 * Moves skill folders into a skills root. Each is copied to a hidden sibling
 * first (pi skips dot folders), then renamed into place, so a failed copy leaves
 * the root as it was. A folder being replaced is renamed aside first and removed
 * only after every rename has worked; a failure puts it back.
 */
export const installFolders = async (
	root: string,
	items: readonly { name: string; from: string }[],
	replace: ReadonlySet<string>,
): Promise<void> => {
	await mkdir(root, { recursive: true });
	const staged: { name: string; temp: string }[] = [];
	const asides: { dest: string; aside: string }[] = [];
	const placed: string[] = [];
	try {
		for (const item of items) {
			const temp = join(root, `.import-${randomUUID()}`);
			staged.push({ name: item.name, temp });
			await cp(item.from, temp, { recursive: true, verbatimSymlinks: true });
		}
		for (const { name, temp } of staged) {
			const dest = join(root, name);
			if (
				await lstat(dest).then(
					() => true,
					() => false,
				)
			) {
				if (!replace.has(name)) throw new Error(`A skill named ${name} already exists there`);
				const aside = join(root, `.import-old-${randomUUID()}`);
				await rename(dest, aside);
				asides.push({ dest, aside });
			}
			await rename(temp, dest);
			placed.push(dest);
		}
	} catch (error) {
		for (const dest of placed)
			await rm(dest, { recursive: true, force: true }).catch(() => undefined);
		for (const { dest, aside } of asides) await rename(aside, dest).catch(() => undefined);
		for (const { temp } of staged)
			await rm(temp, { recursive: true, force: true }).catch(() => undefined);
		throw error;
	}
	for (const { aside } of asides)
		await rm(aside, { recursive: true, force: true }).catch(() => undefined);
};
