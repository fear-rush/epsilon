import { join, resolve } from "node:path";

import { Effect } from "effect";

import { SkillRefused } from "#protocol/errors";
import type { ForeignSkillView, SkillAgent } from "#protocol/settings/skills";

import type { LoadSkillsResult, PackageScope } from "../../platform/pi.ts";

/**
 * Skill folders other coding agents own: Claude Code's and Codex's. They are listed from
 * disk through pi's own loader and never copied or linked on disk. "Linked" means the
 * folder is in the `skills` setting, so pi loads it from where it is; unlinking removes
 * that entry and nothing else.
 */

type ForeignFolder = {
	readonly agent: SkillAgent;
	readonly scope: PackageScope;
	readonly dir: string;
};

/** The folders to look in. A project's `.claude/skills` counts only with a project picked. */
const candidates = (userHome: string, project: string | null): ForeignFolder[] => [
	{ agent: "claude-code", dir: join(userHome, ".claude", "skills"), scope: "user" },
	{ agent: "codex", dir: join(userHome, ".codex", "skills"), scope: "user" },
	...(project === null
		? []
		: [
				{
					agent: "claude-code" as const,
					dir: join(project, ".claude", "skills"),
					scope: "project" as const,
				},
			]),
];

/** The directory a `skills` entry names, or undefined for an override pattern. */
const entryDir = (entry: string, base: string, userHome: string): string | undefined => {
	if (/^[!+-]/u.test(entry)) return undefined;
	if (entry === "~") return userHome;
	if (entry.startsWith("~/")) return join(userHome, entry.slice(2));
	return resolve(base, entry);
};

export type ForeignDeps = {
	/** The folder relative `skills` entries resolve against: the agent home, or `<project>/.pi`. */
	readonly base: string;
	/** The `skills` setting of one scope, as pi holds it. */
	readonly entries: (scope: PackageScope) => ReadonlyArray<string>;
	readonly loadFolder: (dir: string) => LoadSkillsResult;
	readonly project: string | null;
	readonly userHome: string;
	readonly writeEntries: (
		scope: PackageScope,
		entries: ReadonlyArray<string>,
	) => Effect.Effect<void, SkillRefused>;
};

const linkedEntries = (deps: ForeignDeps, target: ForeignFolder): string[] =>
	deps
		.entries(target.scope)
		.filter((entry) => entryDir(entry, deps.base, deps.userHome) === target.dir);

const refused = (path: string, reason: string): SkillRefused => new SkillRefused({ path, reason });

/**
 * Every skill in the other agents' folders that exist. `linked` is pi's own `skills`
 * setting for the scope the folder belongs to.
 */
export const listForeignSkills = (deps: ForeignDeps): ForeignSkillView[] =>
	candidates(deps.userHome, deps.project).flatMap((target) => {
		const { skills, diagnostics } = deps.loadFolder(target.dir);
		const linked = linkedEntries(deps, target).length > 0;
		return skills.map((skill) => ({
			agent: target.agent,
			description: skill.description,
			filePath: skill.filePath,
			folder: target.dir,
			linked,
			name: skill.name,
			scope: target.scope,
			warnings: diagnostics
				.filter((entry) => entry.type !== "collision" && entry.path === skill.filePath)
				.map((entry) => entry.message),
		}));
	});

/** The folder a page-sent path names, when Epsilon detected it. Arbitrary paths never link. */
const detected = (deps: ForeignDeps, dir: string): ForeignFolder | undefined =>
	candidates(deps.userHome, deps.project).find((target) => target.dir === resolve(dir));

/** Adds the folder to the `skills` setting of the file that owns it, or takes it out. */
export const setForeignFolderLinked = (
	deps: ForeignDeps,
	path: string,
	linked: boolean,
): Effect.Effect<void, SkillRefused> =>
	Effect.suspend(() => {
		const target = detected(deps, path);
		if (target === undefined) {
			return Effect.fail(refused(path, `${path} is not a skill folder of another agent`));
		}
		const names = new Set(linkedEntries(deps, target));
		// Already in the setting, or already out of it: nothing to write.
		if (linked && names.size > 0) return Effect.void;
		const entries = deps.entries(target.scope);
		return deps.writeEntries(
			target.scope,
			linked ? [...entries, target.dir] : entries.filter((entry) => !names.has(entry)),
		);
	});
