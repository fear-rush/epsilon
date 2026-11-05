import { dirname, join, resolve, sep } from "node:path";

import { Effect, Option } from "effect";
import type { FileSystem } from "effect";

import { SkillRefused } from "#protocol/errors";
import type { SkillBundleList } from "#protocol/settings/skills";

import {
	IMPORT_MAX_FILES,
	IMPORT_MAX_SKILL_BYTES,
	SKILL_FILE_NAME,
	isStrippedPath,
	skillPathProblem,
} from "../../../domain/skills/rules.ts";
import { removeEmptyDir } from "../../platform/files.ts";

/**
 * The files bundled in one skill folder: scripts, references and assets beside `SKILL.md`.
 * `SKILL.md` has its own editor, so these functions refuse it.
 *
 * The path arrives from the wire, so it is checked as text first, then walked one segment
 * at a time. A symlink anywhere on the walk is refused, which keeps every read and write
 * inside the skill folder without resolving links. The folder itself arrives resolved: the
 * service decides whether a link may be followed and where it goes.
 */

/** A file the editor opens is at most this large. */
const READ_MAX_BYTES = 1024 * 1024;
/** How much of a file decides whether it is text. */
const SNIFF_BYTES = 8 * 1024;

/** One file of a skill folder, as the tree draws it. */
type BundleEntry = { readonly path: string; readonly size: number; readonly text: boolean };

const refused = (path: string | undefined, reason: string): SkillRefused =>
	new SkillRefused(path === undefined ? { reason } : { path, reason });

const failure = (cause: unknown): SkillRefused =>
	refused(undefined, cause instanceof Error ? cause.message : String(cause));

/** The entry's metadata, or none when nothing is there. Links are not followed. */
const lstat = (
	fs: FileSystem.FileSystem,
	path: string,
): Effect.Effect<Option.Option<FileSystem.File.Info>, SkillRefused> =>
	fs.lstat(path).pipe(
		Effect.asSome,
		Effect.catchReason("PlatformError", "NotFound", () => Effect.succeedNone),
		Effect.mapError(failure),
	);

/** Why a path inside a skill folder cannot be edited here, or undefined. */
const bundlePathProblem = (path: string, allowSkillFile: boolean): string | undefined => {
	const problem = skillPathProblem(path);
	if (problem !== undefined) return problem;
	if (path === SKILL_FILE_NAME && !allowSkillFile) {
		return "SKILL.md is edited from the skill form, not as a bundled file";
	}
	if (isStrippedPath(path)) return `${path} is in a folder the dashboard does not manage`;
	return undefined;
};

/**
 * The absolute path for a file, after walking each segment with a stat. A symlink on the
 * way, or a file where a folder should be, is refused. A segment that does not exist yet
 * ends the walk: the rest is created by a write.
 */
const resolveBundlePath = (
	fs: FileSystem.FileSystem,
	directory: string,
	path: string,
	allowSkillFile: boolean,
): Effect.Effect<string, SkillRefused> =>
	Effect.gen(function* () {
		const problem = bundlePathProblem(path, allowSkillFile);
		if (problem !== undefined) return yield* refused(path, problem);
		const segments = path.split("/");
		let current = directory;
		for (const [index, segment] of segments.entries()) {
			current = join(current, segment);
			const info = yield* lstat(fs, current);
			if (Option.isNone(info)) break;
			if (info.value.type === "SymbolicLink") {
				return yield* refused(path, `${path} goes through a symlink`);
			}
			if (index < segments.length - 1 && info.value.type !== "Directory") {
				return yield* refused(
					path,
					`${segments.slice(0, index + 1).join("/")} is a file, not a folder`,
				);
			}
		}
		const full = resolve(directory, path);
		if (!full.startsWith(`${directory}${sep}`)) {
			return yield* refused(path, `${path} is outside the skill folder`);
		}
		return full;
	});

/** True when the start of the file is UTF-8 text with no NUL byte. */
const looksLikeText = (fs: FileSystem.FileSystem, path: string): Effect.Effect<boolean> =>
	Effect.scoped(
		Effect.gen(function* () {
			const file = yield* fs.open(path, { flag: "r" });
			const buffer = new Uint8Array(SNIFF_BYTES);
			const read = yield* file.read(buffer, { position: 0n });
			const head = buffer.subarray(0, read);
			if (head.includes(0)) return false;
			// A character cut by the sniff limit is not a reason to call the file binary.
			const decoded = yield* Effect.try(() => {
				new TextDecoder("utf-8", { fatal: true }).decode(head, { stream: read === SNIFF_BYTES });
				return true;
			});
			return decoded;
		}),
	).pipe(Effect.orElseSucceed(() => false));

const byName = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/** Every regular file under the folder; links and files past the limit are counted, not listed. */
const walk = (
	fs: FileSystem.FileSystem,
	directory: string,
): Effect.Effect<SkillBundleList, SkillRefused> =>
	Effect.gen(function* () {
		const files: BundleEntry[] = [];
		const folders: string[] = [];
		let skipped = 0;
		const visit = (folder: string, prefix: string): Effect.Effect<void, SkillRefused> =>
			Effect.gen(function* () {
				const entries = yield* fs
					.readDirectoryEntries(folder)
					.pipe(Effect.mapError((cause) => failure(cause)));
				for (const entry of entries.toSorted((left, right) => byName(left.name, right.name))) {
					const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
					if (isStrippedPath(path)) continue;
					if (entry.type === "SymbolicLink") {
						skipped += 1;
					} else if (entry.type === "Directory") {
						folders.push(path);
						yield* visit(join(folder, entry.name), path);
					} else if (entry.type === "File") {
						if (files.length >= IMPORT_MAX_FILES) {
							skipped += 1;
							continue;
						}
						const full = join(folder, entry.name);
						const info = yield* fs.stat(full).pipe(Effect.mapError((cause) => failure(cause)));
						files.push({
							path,
							size: Number(info.size),
							text: yield* looksLikeText(fs, full),
						});
					}
				}
			});
		yield* visit(directory, "");
		files.sort((left, right) => byName(left.path, right.path));
		folders.sort(byName);
		return { files, folders, skipped };
	});

/** Every file in the skill folder, `SKILL.md` included. */
export const listSkillFiles = (
	fs: FileSystem.FileSystem,
	directory: string,
): Effect.Effect<SkillBundleList, SkillRefused> => walk(fs, directory);

/** The text of the file at `path` in `directory`, refused when binary, oversized or not UTF-8. */
const readTextIn = (
	fs: FileSystem.FileSystem,
	directory: string,
	path: string,
	allowSkillFile: boolean,
): Effect.Effect<string, SkillRefused> =>
	Effect.gen(function* () {
		const full = yield* resolveBundlePath(fs, directory, path, allowSkillFile);
		const info = yield* lstat(fs, full);
		if (Option.isNone(info)) return yield* refused(path, `${path} does not exist`);
		if (info.value.type !== "File") return yield* refused(path, `${path} is not a file`);
		if (Number(info.value.size) > READ_MAX_BYTES) {
			return yield* refused(
				path,
				`${path} is larger than ${READ_MAX_BYTES / 1024 / 1024} MB, too big to edit here`,
			);
		}
		const text = yield* looksLikeText(fs, full);
		if (!text) return yield* refused(path, `${path} is a binary file, not text`);
		const bytes = yield* fs.readFile(full).pipe(Effect.mapError((cause) => failure(cause)));
		return yield* Effect.try({
			try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
			catch: () => refused(path, `${path} is not valid UTF-8 text`),
		});
	});

/** The text of one bundled file; binary, oversized and `SKILL.md` files are refused. */
export const readSkillBundleFile = (
	fs: FileSystem.FileSystem,
	directory: string,
	path: string,
): Effect.Effect<string, SkillRefused> => readTextIn(fs, directory, path, false);

/**
 * Writes one bundled file, creating its folders. An existing file is rewritten in place,
 * so its mode (a script's exec bit) survives. The folder as a whole stays within the
 * size limit.
 */
export const writeSkillBundleFile = (
	fs: FileSystem.FileSystem,
	directory: string,
	path: string,
	text: string,
): Effect.Effect<void, SkillRefused> =>
	Effect.gen(function* () {
		const full = yield* resolveBundlePath(fs, directory, path, false);
		const info = yield* lstat(fs, full);
		if (Option.isSome(info) && info.value.type !== "File") {
			return yield* refused(path, `${path} is not a file`);
		}
		const existing = Option.isSome(info) ? Number(info.value.size) : 0;
		const incoming = Buffer.byteLength(text, "utf8");
		const { files } = yield* walk(fs, directory);
		const others = files.reduce((sum, file) => sum + file.size, 0) - existing;
		if (others + incoming > IMPORT_MAX_SKILL_BYTES) {
			return yield* refused(
				path,
				`${path} would take the skill past ${IMPORT_MAX_SKILL_BYTES / 1024 / 1024} MB; ${path} was not changed`,
			);
		}
		yield* fs
			.makeDirectory(dirname(full), { recursive: true })
			.pipe(Effect.mapError((cause) => failure(cause)));
		yield* fs.writeFileString(full, text).pipe(Effect.mapError((cause) => failure(cause)));
		return undefined;
	});

/**
 * Creates one folder inside a skill, with the folders above it. `SKILL.md`, an unsafe
 * path, a symlink on the way and a path that already exists are refused.
 */
export const createSkillBundleFolder = (
	fs: FileSystem.FileSystem,
	directory: string,
	path: string,
): Effect.Effect<void, SkillRefused> =>
	Effect.gen(function* () {
		const problem = bundlePathProblem(path, false);
		if (problem !== undefined) return yield* refused(path, problem);
		const full = yield* resolveBundlePath(fs, directory, path, false);
		const info = yield* lstat(fs, full);
		if (Option.isSome(info)) return yield* refused(path, `${path} already exists`);
		yield* fs
			.makeDirectory(full, { recursive: true })
			.pipe(Effect.mapError((cause) => failure(cause)));
		return undefined;
	});

/**
 * Deletes one empty folder inside a skill. A file, a folder holding anything or a symlink
 * on the walk is refused; deleting a file prunes the folders above it, so a folder only
 * needs this while it is empty.
 */
export const deleteSkillBundleFolder = (
	fs: FileSystem.FileSystem,
	directory: string,
	path: string,
): Effect.Effect<void, SkillRefused> =>
	Effect.gen(function* () {
		const problem = bundlePathProblem(path, false);
		if (problem !== undefined) return yield* refused(path, problem);
		const full = yield* resolveBundlePath(fs, directory, path, false);
		const info = yield* lstat(fs, full);
		if (Option.isNone(info)) return yield* refused(path, `${path} does not exist`);
		if (info.value.type !== "Directory") {
			return yield* refused(path, `${path} is a file, not a folder`);
		}
		const entries = yield* fs.readDirectory(full).pipe(Effect.mapError((cause) => failure(cause)));
		if (entries.length > 0) {
			return yield* refused(path, `${path} is not empty; delete the files in it first`);
		}
		yield* removeEmptyDir(full).pipe(Effect.mapError((cause) => failure(cause)));
		return undefined;
	});

/** Deletes one bundled file, then the folders it leaves empty (never the skill folder). */
export const deleteSkillBundleFile = (
	fs: FileSystem.FileSystem,
	directory: string,
	path: string,
): Effect.Effect<void, SkillRefused> =>
	Effect.gen(function* () {
		const full = yield* resolveBundlePath(fs, directory, path, false);
		const info = yield* lstat(fs, full);
		if (Option.isNone(info)) return yield* refused(path, `${path} does not exist`);
		if (info.value.type !== "File") return yield* refused(path, `${path} is not a file`);
		yield* fs.remove(full).pipe(Effect.mapError((cause) => failure(cause)));
		let folder = dirname(full);
		while (folder !== directory) {
			const left = yield* fs.readDirectory(folder).pipe(Effect.orElseSucceed(() => []));
			if (left.length > 0) break;
			yield* removeEmptyDir(folder).pipe(
				Effect.mapError((cause) => failure(cause)),
				Effect.orElseSucceed(() => undefined),
			);
			folder = dirname(folder);
		}
		return undefined;
	});
