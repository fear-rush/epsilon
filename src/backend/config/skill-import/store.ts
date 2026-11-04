import { dirname, isAbsolute, join, relative, sep } from "node:path";

import { Clock, Effect, Option, Schema } from "effect";
import type { FileSystem } from "effect";

import type { SkillImportPackageOption } from "#protocol/config/skill-import";
import { ImportFailed, StageGone } from "#protocol/errors";

import type { ArchiveEntry } from "../../../domain/skills/archive.ts";
import { isStrippedPath, skillPathProblem } from "../../../domain/skills/rules.ts";
import type { AgentHomeApi } from "../../platform/agent-home.ts";

/**
 * Staging on disk. A stage is a folder under the agent home's `tmp/skill-import`: the
 * unpacked source in `tree/` and a small `stage.json` beside it. The folder is the whole
 * state, so a restart loses nothing and a stale stage is just an old folder to delete.
 * Every path from a browser is checked here, before it is joined onto a disk path.
 */

/** A stage older than this is deleted when the next one is created. */
const STAGE_LIFETIME_MS = 60 * 60 * 1000;
/** More entries than this is not a skill; stop before writing thousands of files. */
const MAX_ENTRIES = 20_000;

const Skipped = Schema.Struct({
	path: Schema.String,
	reason: Schema.Literals(["stripped", "symlink"]),
});

const StageFile = Schema.Struct({
	source: Schema.String,
	cliSource: Schema.optional(Schema.String),
	createdAt: Schema.Finite,
	skipped: Schema.Array(Skipped),
	packageOption: Schema.Struct({
		available: Schema.Boolean,
		source: Schema.optional(Schema.String),
		reason: Schema.String,
	}),
});
export type StageFile = typeof StageFile.Type;

export type IngestEntry = {
	readonly path: string;
	readonly kind: ArchiveEntry["kind"];
	readonly bytes: Uint8Array;
	readonly mode: number | undefined;
};

const errorText = (cause: unknown): string =>
	cause instanceof Error ? cause.message : String(cause);

const fileFailure =
	(path: string) =>
	(cause: unknown): ImportFailed =>
		new ImportFailed({ reason: `${path}: ${errorText(cause)}` });

export const stagesRoot = (home: AgentHomeApi): string =>
	join(home.epsilonDir, "tmp", "skill-import");

export const stagePaths = (home: AgentHomeApi, stageId: string) => {
	const dir = join(stagesRoot(home), stageId);
	return { dir, tree: join(dir, "tree"), file: join(dir, "stage.json") };
};

/** Deletes stages past their lifetime. A stage that will not go is left for the next sweep. */
const sweepStages = (
	fs: FileSystem.FileSystem,
	home: AgentHomeApi,
	now: number,
): Effect.Effect<void> =>
	Effect.gen(function* () {
		const root = stagesRoot(home);
		const entries = yield* fs.readDirectoryEntries(root).pipe(Effect.orElseSucceed(() => []));
		for (const entry of entries) {
			const path = join(root, entry.name);
			const info = yield* fs.stat(path).pipe(Effect.orElseSucceed(() => undefined));
			if (info === undefined) continue;
			const modified = Option.getOrUndefined(info.mtime)?.getTime() ?? 0;
			if (now - modified > STAGE_LIFETIME_MS) {
				yield* fs.remove(path, { force: true, recursive: true }).pipe(Effect.ignore);
			}
		}
	});

/** A new empty stage; stale ones are swept first. */
export const createStage = (
	fs: FileSystem.FileSystem,
	home: AgentHomeApi,
): Effect.Effect<{ stageId: string; dir: string; tree: string }, ImportFailed> =>
	Effect.gen(function* () {
		const now = yield* Clock.currentTimeMillis;
		yield* sweepStages(fs, home, now);
		const stageId = crypto.randomUUID();
		const paths = stagePaths(home, stageId);
		yield* fs
			.makeDirectory(paths.tree, { recursive: true })
			.pipe(Effect.mapError(fileFailure(paths.tree)));
		return { stageId, ...paths };
	});

export const discardStage = (
	fs: FileSystem.FileSystem,
	home: AgentHomeApi,
	stageId: string,
): Effect.Effect<void> =>
	fs.remove(stagePaths(home, stageId).dir, { force: true, recursive: true }).pipe(Effect.ignore);

export const saveStage = (
	fs: FileSystem.FileSystem,
	home: AgentHomeApi,
	stageId: string,
	stage: StageFile,
): Effect.Effect<void, ImportFailed> =>
	fs
		.writeFileString(stagePaths(home, stageId).file, `${JSON.stringify(stage, null, 2)}\n`)
		.pipe(Effect.mapError(fileFailure(stagePaths(home, stageId).file)));

/** The stage's record, or undefined when the stage is gone or was never finished. */
export const loadStage = (
	fs: FileSystem.FileSystem,
	home: AgentHomeApi,
	stageId: string,
): Effect.Effect<StageFile | undefined> =>
	Effect.gen(function* () {
		const text = yield* fs
			.readFileString(stagePaths(home, stageId).file)
			.pipe(Effect.orElseSucceed(() => undefined));
		if (text === undefined) return undefined;
		const decoded = Schema.decodeOption(Schema.fromJsonString(StageFile))(text);
		return Option.getOrUndefined(decoded);
	});

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
 * Writes entries under `tree`. A path that could leave the folder refuses the whole
 * stage: an honest bundle has none, so one is an attack or a broken tool. Version control
 * and OS litter are skipped and links are not created; both come back for the report.
 */
export const writeEntries = (
	fs: FileSystem.FileSystem,
	tree: string,
	entries: ReadonlyArray<IngestEntry>,
): Effect.Effect<ReadonlyArray<StageFile["skipped"][number]>, ImportFailed> =>
	Effect.gen(function* () {
		if (entries.length > MAX_ENTRIES) {
			return yield* new ImportFailed({
				reason: `The source has ${entries.length} files; that is too many to be a skill`,
			});
		}
		const skipped: StageFile["skipped"][number][] = [];
		for (const entry of entries) {
			const path = entry.path.replace(/^(\.\/)+/, "").replace(/\/+$/, "");
			if (path === "" || path === ".") continue;
			const problem = skillPathProblem(path);
			if (problem !== undefined) {
				return yield* new ImportFailed({ reason: `${path}: Refused: ${problem}` });
			}
			if (isStrippedPath(path)) {
				const top = outermostStripped(path);
				if (!skipped.some((item) => item.path === top)) {
					skipped.push({ path: top, reason: "stripped" });
				}
				continue;
			}
			if (entry.kind === "link") {
				skipped.push({ path, reason: "symlink" });
				continue;
			}
			if (entry.kind === "directory") continue;
			const target = join(tree, path);
			if (!inside(target, tree)) {
				return yield* new ImportFailed({ reason: `${path}: Refused: it is outside its folder` });
			}
			yield* fs
				.makeDirectory(dirname(target), { recursive: true })
				.pipe(Effect.mapError(fileFailure(target)));
			yield* fs.writeFile(target, entry.bytes).pipe(Effect.mapError(fileFailure(target)));
			// Only the execute bit is kept: it decides whether a script is flagged.
			const executable = entry.mode !== undefined && (entry.mode & 0o111) !== 0;
			yield* fs
				.chmod(target, executable ? 0o755 : 0o644)
				.pipe(Effect.mapError(fileFailure(target)));
		}
		return skipped;
	});

/** Every entry under `tree`, by `lstat`, so a link is seen and never followed. */
const walk = (
	fs: FileSystem.FileSystem,
	base: string,
	dir: string,
	visit: (
		relativePath: string,
		kind: "file" | "link",
		mode: number,
		size: number,
	) => Effect.Effect<void, ImportFailed>,
	skipStripped: boolean,
): Effect.Effect<ReadonlyArray<string>, ImportFailed> =>
	Effect.gen(function* () {
		const stripped: string[] = [];
		const entries = yield* fs.readDirectoryEntries(dir).pipe(Effect.mapError(fileFailure(dir)));
		for (const entry of entries) {
			const full = join(dir, entry.name);
			const rel = relative(base, full).split(sep).join("/");
			if (skipStripped && isStrippedPath(rel)) {
				stripped.push(rel);
				continue;
			}
			const info = yield* fs.lstat(full).pipe(Effect.mapError(fileFailure(full)));
			if (info.type === "SymbolicLink") {
				yield* visit(rel, "link", info.mode, 0);
			} else if (info.type === "Directory") {
				stripped.push(...(yield* walk(fs, base, full, visit, skipStripped)));
			} else if (info.type === "File") {
				yield* visit(rel, "file", info.mode, Number(info.size));
			}
		}
		return stripped;
	});

/** Removes the paths the import never installs from a tree something else filled. */
export const pruneTree = (
	fs: FileSystem.FileSystem,
	tree: string,
): Effect.Effect<ReadonlyArray<StageFile["skipped"][number]>, ImportFailed> =>
	Effect.gen(function* () {
		const stripped = yield* walk(fs, tree, tree, () => Effect.void, true);
		for (const path of stripped) {
			yield* fs
				.remove(join(tree, path), { force: true, recursive: true })
				.pipe(Effect.mapError(fileFailure(path)));
		}
		return stripped.map((path) => ({ path, reason: "stripped" as const }));
	});

/** The first two bytes of a file, so a script's shebang can be seen without reading it. */
const headOf = (fs: FileSystem.FileSystem, path: string): Effect.Effect<string> =>
	Effect.scoped(
		Effect.gen(function* () {
			const file = yield* fs.open(path).pipe(Effect.orElseSucceed(() => undefined));
			if (file === undefined) return "";
			const buffer = new Uint8Array(2);
			const read = yield* file.read(buffer).pipe(Effect.orElseSucceed(() => 0));
			return new TextDecoder().decode(buffer.subarray(0, read));
		}),
	);

/** The files of a tree and the links in it. */
export const listTree = (
	fs: FileSystem.FileSystem,
	tree: string,
): Effect.Effect<
	{
		readonly files: ReadonlyArray<{
			path: string;
			size: number;
			executable: boolean;
			shebang: boolean;
		}>;
		readonly links: ReadonlyArray<string>;
	},
	ImportFailed
> =>
	Effect.gen(function* () {
		const files: { path: string; size: number; executable: boolean; shebang: boolean }[] = [];
		const links: string[] = [];
		yield* walk(
			fs,
			tree,
			tree,
			(path, kind, mode, size) =>
				Effect.gen(function* () {
					if (kind === "link") {
						links.push(path);
						return;
					}
					const head = size === 0 ? "" : yield* headOf(fs, join(tree, path));
					files.push({
						path,
						size,
						executable: (mode & 0o111) !== 0,
						shebang: head === "#!",
					});
				}),
			false,
		);
		return { files, links: links.toSorted() };
	});

export const readTreeText = (
	fs: FileSystem.FileSystem,
	tree: string,
	path: string,
): Effect.Effect<string | undefined> =>
	fs.readFileString(join(tree, path)).pipe(Effect.orElseSucceed(() => undefined));

/** True when the skills root already holds a folder of this name. */
export const skillFolderExists = (
	fs: FileSystem.FileSystem,
	root: string,
	name: string,
): Effect.Effect<boolean> =>
	fs.stat(join(root, name)).pipe(
		Effect.map((info) => info.type === "Directory"),
		Effect.orElseSucceed(() => false),
	);

/**
 * Moves skill folders into a skills root. Each is copied to a hidden sibling first (pi
 * skips dot folders), then renamed into place, so a failed copy leaves the root as it
 * was. A folder being replaced is renamed aside first and removed only after every rename
 * has worked; a failure puts it back, and a rollback failure is named in the refusal.
 */
export const installFolders = (
	fs: FileSystem.FileSystem,
	root: string,
	items: ReadonlyArray<{ readonly name: string; readonly from: string }>,
	replace: ReadonlySet<string>,
): Effect.Effect<void, ImportFailed> =>
	Effect.gen(function* () {
		yield* fs.makeDirectory(root, { recursive: true }).pipe(Effect.mapError(fileFailure(root)));
		const staged: { name: string; temp: string }[] = [];
		const asides: { dest: string; aside: string }[] = [];
		const placed: string[] = [];
		const rollbackProblems: string[] = [];
		const rollback = Effect.gen(function* () {
			for (const dest of placed) {
				yield* fs.remove(dest, { force: true, recursive: true }).pipe(
					Effect.catchTag("PlatformError", (error) =>
						Effect.sync(() => {
							rollbackProblems.push(`remove ${dest}: ${errorText(error)}`);
						}),
					),
					Effect.ignore,
				);
			}
			for (const { dest, aside } of asides) {
				yield* fs.rename(aside, dest).pipe(
					Effect.catchTag("PlatformError", (error) =>
						Effect.sync(() => {
							rollbackProblems.push(`restore ${dest}: ${errorText(error)}`);
						}),
					),
					Effect.ignore,
				);
			}
			for (const { temp } of staged) {
				yield* fs.remove(temp, { force: true, recursive: true }).pipe(Effect.ignore);
			}
		});
		yield* Effect.gen(function* () {
			for (const item of items) {
				const temp = join(root, `.import-${crypto.randomUUID()}`);
				staged.push({ name: item.name, temp });
				yield* fs
					.copy(item.from, temp, { overwrite: true })
					.pipe(Effect.mapError(fileFailure(item.from)));
			}
			for (const { name, temp } of staged) {
				const dest = join(root, name);
				const exists = yield* fs.stat(dest).pipe(
					Effect.as(true),
					Effect.orElseSucceed(() => false),
				);
				if (exists) {
					if (!replace.has(name)) {
						return yield* new ImportFailed({
							reason: `A skill named ${name} already exists there`,
						});
					}
					const aside = join(root, `.import-old-${crypto.randomUUID()}`);
					yield* fs.rename(dest, aside).pipe(Effect.mapError(fileFailure(dest)));
					asides.push({ dest, aside });
				}
				yield* fs.rename(temp, dest).pipe(Effect.mapError(fileFailure(temp)));
				placed.push(dest);
			}
			return undefined;
		}).pipe(
			Effect.catchTag("ImportFailed", (error) =>
				Effect.gen(function* () {
					yield* rollback;
					const suffix =
						rollbackProblems.length === 0
							? ""
							: ` (rollback also failed: ${rollbackProblems.join("; ")})`;
					return yield* new ImportFailed({ reason: `${error.reason}${suffix}` });
				}),
			),
		);
		for (const { aside } of asides) {
			yield* fs.remove(aside, { force: true, recursive: true }).pipe(Effect.ignore);
		}
	});

export const requireStage = (
	fs: FileSystem.FileSystem,
	home: AgentHomeApi,
	stageId: string,
): Effect.Effect<StageFile, StageGone> =>
	Effect.gen(function* () {
		const stage = yield* loadStage(fs, home, stageId);
		if (stage === undefined) return yield* new StageGone({});
		return stage;
	});

export const packageOptionUnavailable = (reason: string): SkillImportPackageOption => ({
	available: false,
	reason,
});
