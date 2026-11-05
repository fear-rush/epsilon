import { extname, join, resolve } from "node:path";

import { Effect, Option } from "effect";
import type { FileSystem } from "effect";

import { SkillRefused } from "#protocol/errors";

/**
 * Arbitrary paths in pi's `skills` setting: any folder, or one `.md` file, that pi reads
 * skills from where they are. The other agents' folder shortcuts in `foreign.ts` write the
 * same array, and the per-skill switches write `-path` entries into it; this module edits
 * the source paths, the entries that name something for pi to read.
 */

export type SkillPathsDeps = {
	/** The folder relative entries resolve against: the agent home, or `<project>/.pi`. */
	readonly base: string;
	readonly entries: ReadonlyArray<string>;
	readonly fs: FileSystem.FileSystem;
	readonly userHome: string;
	readonly writeEntries: (entries: ReadonlyArray<string>) => Effect.Effect<void, SkillRefused>;
};

/** An entry pi reads as an override rather than a source: a mark, or a glob. */
const NOT_A_SOURCE = /^[!+-]|[?*]/;

const refused = (path: string | undefined, reason: string): SkillRefused =>
	new SkillRefused(path === undefined ? { reason } : { path, reason });

/** The absolute path an entry names, resolved the way pi resolves the setting. */
const entryPath = (deps: SkillPathsDeps, raw: string): string => {
	const trimmed = raw.trim();
	const expanded =
		trimmed === "~"
			? deps.userHome
			: trimmed.startsWith("~/")
				? join(deps.userHome, trimmed.slice(2))
				: trimmed;
	return resolve(deps.base, expanded);
};

/** Where a stored entry points, with its override mark removed. */
const entryTarget = (deps: SkillPathsDeps, entry: string): string =>
	entryPath(deps, entry.replace(/^[!+-]/, ""));

/** The source paths of the scope's `skills` setting, as written there. */
export const skillSourcePaths = (entries: ReadonlyArray<string>): string[] =>
	entries.filter((entry) => !NOT_A_SOURCE.test(entry));

/** The entry's metadata, or none when nothing is there. Links are followed, as pi does. */
const stat = (fs: FileSystem.FileSystem, path: string) =>
	fs.stat(path).pipe(
		Effect.asSome,
		Effect.catchReason("PlatformError", "NotFound", () => Effect.succeedNone),
		Effect.mapError((cause): SkillRefused =>
			refused(undefined, cause instanceof Error ? cause.message : String(cause)),
		),
	);

/**
 * Adds a folder or `.md` file to the scope's `skills` setting. Anything already naming that
 * target goes first, a `-path` switch included, so the new source actually loads instead of
 * being force-excluded by a leftover entry.
 */
export const addSkillPath = (
	deps: SkillPathsDeps,
	raw: string,
): Effect.Effect<void, SkillRefused> =>
	Effect.gen(function* () {
		const path = raw.trim();
		if (path === "") return yield* refused(undefined, "A path is required");
		const target = entryPath(deps, path);
		const info = yield* stat(deps.fs, target);
		if (Option.isNone(info)) return yield* refused(path, `${path} does not exist`);
		if (info.value.type === "File" && extname(target) !== ".md") {
			return yield* refused(path, "A skill path is a folder or a .md file");
		}
		if (info.value.type !== "Directory" && info.value.type !== "File") {
			return yield* refused(path, `${path} is not a file or a folder`);
		}
		const kept = deps.entries.filter((entry) => entryTarget(deps, entry) !== target);
		yield* deps.writeEntries([...kept, target]);
		return undefined;
	});

/** Removes every entry that names the same target, so no leftover switch outlives it. */
export const removeSkillPath = (
	deps: SkillPathsDeps,
	raw: string,
): Effect.Effect<void, SkillRefused> =>
	Effect.gen(function* () {
		const target = entryPath(deps, raw);
		const next = deps.entries.filter((entry) => entryTarget(deps, entry) !== target);
		if (next.length === deps.entries.length) {
			return yield* refused(raw, "That path is not in the skills setting");
		}
		yield* deps.writeEntries(next);
		return undefined;
	});
