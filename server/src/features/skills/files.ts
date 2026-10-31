/**
 * The files bundled in one skill folder: scripts, references and assets beside
 * `SKILL.md`. `SKILL.md` has its own route, so these functions refuse it.
 *
 * The path arrives from a query string, so it is checked as text first, then
 * walked one segment at a time. A symlink anywhere on the walk is refused, which
 * keeps every read and write inside the skill folder without resolving links.
 *
 * The skill folder itself may be a link, which is how the `skills` CLI installs
 * (`~/.pi/agent/skills/x -> ~/.agents/skills/x`). It is followed only when its
 * target is a skill folder directly inside one of `linkRoots`, the other skills
 * folders Epsilon edits; the walk then runs in the real folder.
 */
import {
	lstat,
	realpath,
	mkdir,
	open,
	readdir,
	readFile,
	rmdir,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { IMPORT_MAX_FILES, IMPORT_MAX_SKILL_BYTES, isStrippedPath, skillPathProblem } from "shared";

import type { z } from "@hono/zod-openapi";
import type { skillBundleListSchema } from "./contract";

type SkillBundleList = z.infer<typeof skillBundleListSchema>;

/** A file the editor opens is at most this large. */
const READ_MAX_BYTES = 1024 * 1024;
/** How much of a file decides whether it is text. */
const SNIFF_BYTES = 8 * 1024;

/** The file's stats, or undefined when nothing is there. Links are not followed. */
const lstatOrUndefined = async (path: string) => {
	try {
		return await lstat(path);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
		throw error;
	}
};

/**
 * The skill folder, refused unless it is a real directory (not a link) holding
 * a `SKILL.md`. The name comes from a URL segment, so it must stay in the root.
 */
export const skillFolder = async (
	root: string,
	name: string,
	linkRoots: readonly string[],
): Promise<string> => {
	const base = resolve(root);
	const directory = resolve(base, name);
	if (dirname(directory) !== base) throw new Error(`"${name}" is not a skill directory name`);
	const missing = new Error(`No skill named "${name}" in that folder`);
	const entry = await lstatOrUndefined(directory);
	if (entry === undefined) throw missing;
	let real = directory;
	if (entry.isSymbolicLink()) {
		real = await realpath(directory).catch(() => {
			throw missing;
		});
		const roots = await Promise.all(
			[base, ...linkRoots].map((candidate) => realpath(candidate).catch(() => resolve(candidate))),
		);
		if (!roots.includes(dirname(real))) {
			throw new Error(`"${name}" links outside the skills folders Epsilon edits`);
		}
	}
	const info = await lstatOrUndefined(real);
	const skill = await lstatOrUndefined(join(real, "SKILL.md"));
	if (info?.isDirectory() !== true || skill?.isFile() !== true) throw missing;
	return real;
};

/** Why a path inside a skill folder cannot be edited here, or undefined. */
const bundlePathProblem = (path: string, allowSkillFile: boolean): string | undefined => {
	const problem = skillPathProblem(path);
	if (problem !== undefined) return problem;
	if (path === "SKILL.md" && !allowSkillFile)
		return "SKILL.md is edited from the skill form, not as a bundled file";
	if (isStrippedPath(path)) return `${path} is in a folder the dashboard does not manage`;
	return undefined;
};

/**
 * The absolute path for a file, after walking each segment with `lstat`. A
 * symlink on the way, or a file where a folder should be, is refused. A segment
 * that does not exist yet ends the walk: the rest is created by a write.
 */
const resolveBundlePath = async (
	directory: string,
	path: string,
	allowSkillFile = false,
): Promise<string> => {
	const problem = bundlePathProblem(path, allowSkillFile);
	if (problem !== undefined) throw new Error(problem);
	const segments = path.split("/");
	let current = directory;
	for (const [index, segment] of segments.entries()) {
		current = join(current, segment);
		const info = await lstatOrUndefined(current);
		if (info === undefined) break;
		if (info.isSymbolicLink()) throw new Error(`${path} goes through a symlink`);
		if (index < segments.length - 1 && !info.isDirectory()) {
			throw new Error(`${segments.slice(0, index + 1).join("/")} is a file, not a folder`);
		}
	}
	const full = resolve(directory, path);
	if (!full.startsWith(directory + sep)) throw new Error(`${path} is outside the skill folder`);
	return full;
};

/** True when the start of the file is UTF-8 text with no NUL byte. */
const looksLikeText = async (path: string): Promise<boolean> => {
	const handle = await open(path, "r");
	try {
		const buffer = Buffer.alloc(SNIFF_BYTES);
		const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0);
		const head = buffer.subarray(0, bytesRead);
		if (head.includes(0)) return false;
		// A character cut by the sniff limit is not a reason to call the file binary.
		new TextDecoder("utf-8", { fatal: true }).decode(head, { stream: bytesRead === SNIFF_BYTES });
		return true;
	} catch {
		return false;
	} finally {
		await handle.close();
	}
};

/** Every regular file under the folder; links and files past the limit are counted, not listed. */
const walk = async (directory: string): Promise<SkillBundleList> => {
	const files: SkillBundleList["files"] = [];
	let skipped = 0;
	const visit = async (folder: string, prefix: string): Promise<void> => {
		for (const entry of await readdir(folder, { withFileTypes: true })) {
			const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
			if (isStrippedPath(path)) continue;
			if (entry.isSymbolicLink()) skipped += 1;
			else if (entry.isDirectory()) await visit(join(folder, entry.name), path);
			else if (entry.isFile()) {
				if (files.length >= IMPORT_MAX_FILES) {
					skipped += 1;
					continue;
				}
				const full = join(folder, entry.name);
				files.push({ path, size: (await stat(full)).size, text: await looksLikeText(full) });
			}
		}
	};
	await visit(directory, "");
	files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	return { files, skipped };
};

/** Every file in the skill folder, `SKILL.md` included. */
export const listSkillFiles = async (
	root: string,
	name: string,
	linkRoots: readonly string[] = [],
): Promise<SkillBundleList> => walk(await skillFolder(root, name, linkRoots));

/** The text of the file at `path` in `directory`, refused when binary, oversized or not UTF-8. */
const readTextIn = async (
	directory: string,
	path: string,
	allowSkillFile: boolean,
): Promise<string> => {
	const full = await resolveBundlePath(directory, path, allowSkillFile);
	const info = await lstatOrUndefined(full);
	if (info === undefined) throw new Error(`${path} does not exist`);
	if (!info.isFile()) throw new Error(`${path} is not a file`);
	if (info.size > READ_MAX_BYTES) {
		throw new Error(
			`${path} is larger than ${READ_MAX_BYTES / 1024 / 1024} MB, too big to edit here`,
		);
	}
	if (!(await looksLikeText(full))) throw new Error(`${path} is a binary file, not text`);
	const bytes = await readFile(full);
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch (error) {
		throw new Error(`${path} is not valid UTF-8 text`, { cause: error });
	}
};

/** The text of one bundled file; binary, oversized and `SKILL.md` files are refused. */
export const readSkillBundleFile = async (
	root: string,
	name: string,
	path: string,
	linkRoots: readonly string[] = [],
): Promise<string> => readTextIn(await skillFolder(root, name, linkRoots), path, false);

/**
 * The files of a skill the inventory lists, for display. A `SKILL.md` lists its
 * folder; a lone markdown file lists itself, so its neighbours stay private.
 */
export const listListedSkillFiles = async (filePath: string): Promise<SkillBundleList> => {
	if (basename(filePath) === "SKILL.md") return walk(dirname(filePath));
	const info = await lstatOrUndefined(filePath);
	if (info?.isFile() !== true) throw new Error(`${basename(filePath)} does not exist`);
	return {
		files: [{ path: basename(filePath), size: info.size, text: await looksLikeText(filePath) }],
		skipped: 0,
	};
};

/** One file of a listed skill, `SKILL.md` included, under the bundle routes' path checks. */
export const readListedSkillFile = async (filePath: string, path: string): Promise<string> => {
	if (basename(filePath) === "SKILL.md") return readTextIn(dirname(filePath), path, true);
	if (path !== basename(filePath)) throw new Error(`${path} is not part of this skill`);
	return readTextIn(dirname(filePath), path, true);
};

/**
 * Writes one bundled file, creating its folders. An existing file is rewritten in
 * place, so its mode (a script's exec bit) survives. The folder as a whole stays
 * within the size limit.
 */
export const writeSkillBundleFile = async (
	root: string,
	name: string,
	path: string,
	text: string,
	linkRoots: readonly string[] = [],
): Promise<void> => {
	const directory = await skillFolder(root, name, linkRoots);
	const full = await resolveBundlePath(directory, path);
	const info = await lstatOrUndefined(full);
	if (info !== undefined && !info.isFile()) throw new Error(`${path} is not a file`);
	const existing = info?.size ?? 0;
	const incoming = Buffer.byteLength(text, "utf8");
	const { files } = await walk(directory);
	const others = files.reduce((sum, file) => sum + file.size, 0) - existing;
	if (others + incoming > IMPORT_MAX_SKILL_BYTES) {
		throw new Error(
			`${path} would take the skill past ${IMPORT_MAX_SKILL_BYTES / 1024 / 1024} MB; ${path} was not changed`,
		);
	}
	await mkdir(dirname(full), { recursive: true });
	await writeFile(full, text, "utf8");
};

/** Deletes one bundled file, then the folders it leaves empty (never the skill folder). */
export const deleteSkillBundleFile = async (
	root: string,
	name: string,
	path: string,
	linkRoots: readonly string[] = [],
): Promise<void> => {
	const directory = await skillFolder(root, name, linkRoots);
	const full = await resolveBundlePath(directory, path);
	const info = await lstatOrUndefined(full);
	if (info === undefined) throw new Error(`${path} does not exist`);
	if (!info.isFile()) throw new Error(`${path} is not a file`);
	await unlink(full);
	for (let folder = dirname(full); folder !== directory; folder = dirname(folder)) {
		try {
			await rmdir(folder);
		} catch {
			break;
		}
	}
};
