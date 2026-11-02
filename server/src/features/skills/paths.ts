/**
 * Arbitrary paths in pi's `skills` setting: any folder, or one `.md` file, that pi
 * should read skills from where they are. The foreign-folder shortcuts in
 * `foreign.ts` write the same array as presets, and the per-skill switches write
 * `-path` entries into it; this module edits the source paths only.
 */
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join, resolve } from "node:path";

import type { AgentHome } from "../../platform/agent-home";
import { readSkillEntries, writeSkillEntries } from "../../platform/pi";
import type { SettingsScope } from "../../platform/pi";
import { settingsBaseDir } from "../projects";

/** An entry pi reads as an override rather than a source: a mark, or a glob. */
const NOT_A_SOURCE = /^[!+-]|[?*]/;

/** The absolute path an entry names, resolved the way pi resolves the setting. */
const entryPath = (folder: string, home: AgentHome, scope: SettingsScope, raw: string): string => {
	const trimmed = raw.trim();
	const expanded =
		trimmed === "~"
			? homedir()
			: trimmed.startsWith("~/")
				? join(homedir(), trimmed.slice(2))
				: trimmed;
	return resolve(settingsBaseDir(home, folder, scope), expanded);
};

/** Where a stored entry points, with its override mark removed. */
const entryTarget = (
	folder: string,
	home: AgentHome,
	scope: SettingsScope,
	entry: string,
): string => entryPath(folder, home, scope, entry.replace(/^[!+-]/, ""));

/** The source paths of the scope's `skills` setting, as written there. */
export const skillSourcePaths = (folder: string, home: AgentHome, scope: SettingsScope): string[] =>
	readSkillEntries(folder, home, scope).filter((entry) => !NOT_A_SOURCE.test(entry));

/**
 * Adds a folder or `.md` file to the scope's `skills` setting. Anything already
 * naming that target goes first, a `-path` switch included, so the new source
 * actually loads instead of being force-excluded by a leftover entry.
 */
export const addSkillPath = async (
	folder: string,
	home: AgentHome,
	scope: SettingsScope,
	raw: string,
): Promise<void> => {
	const path = raw.trim();
	if (path === "") throw new Error("A path is required");
	const target = entryPath(folder, home, scope, path);
	if (!existsSync(target)) throw new Error(`${path} does not exist`);
	const stats = statSync(target);
	if (stats.isFile() && extname(target) !== ".md") {
		throw new Error("A skill path is a folder or a .md file");
	}
	if (!stats.isDirectory() && !stats.isFile()) throw new Error(`${path} is not a file or a folder`);
	const entries = readSkillEntries(folder, home, scope);
	const kept = entries.filter((entry) => entryTarget(folder, home, scope, entry) !== target);
	await writeSkillEntries(folder, home, scope, [...kept, target]);
};

/** Removes every entry that names the same target, so no leftover switch outlives it. */
export const removeSkillPath = async (
	folder: string,
	home: AgentHome,
	scope: SettingsScope,
	raw: string,
): Promise<void> => {
	const target = entryPath(folder, home, scope, raw);
	const entries = readSkillEntries(folder, home, scope);
	const next = entries.filter((entry) => entryTarget(folder, home, scope, entry) !== target);
	if (next.length === entries.length) throw new Error("That path is not in the skills setting");
	await writeSkillEntries(folder, home, scope, next);
};
