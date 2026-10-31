/**
 * Turning one skill off or on is a `-<path>` entry in the `skills` setting, which
 * pi's resolver reads as "force-exclude this skill" (`isEnabledByOverrides`). The
 * entry is the skill's absolute directory, which pi matches whatever base folder
 * the skill was found under. The setting is written with `SettingsManager`.
 *
 * A package skill is excluded through the package's own filter in Packages, not
 * here.
 */
import { dirname, resolve } from "node:path";

import type { AgentHome } from "../../platform/agent-home";
import { readSkillEntries, writeSkillEntries } from "../../platform/pi";
import { listSkills } from "./inventory";

/** The folder a settings file's relative entries are read against. */
const baseOf = (scope: "user" | "project", folder: string, home: AgentHome): string =>
	scope === "user" ? home.dir : resolve(folder, ".pi");

/** Whether an override entry force-excludes this skill, however it was spelled. */
const excludes = (entry: string, base: string, dir: string): boolean => {
	if (!entry.startsWith("-")) return false;
	const target = resolve(base, entry.slice(1));
	return target === dir || dirname(target) === dir;
};

/**
 * Sets one skill on or off. `filePath` must be a skill the inventory lists, so a
 * path from the browser never reaches settings unchecked. `project` is the
 * project folder, or null for the home alone.
 */
export const setSkillEnabled = async (
	folder: string,
	home: AgentHome,
	project: string | null,
	filePath: string,
	enabled: boolean,
): Promise<void> => {
	const skill = (await listSkills(folder, home, project)).find(
		(entry) => entry.filePath === filePath,
	);
	if (skill === undefined) throw new Error("No such skill");
	if (skill.toggle === "package") {
		throw new Error(
			`This skill comes from the package ${skill.packageSource ?? ""}. Turn it off from Packages.`,
		);
	}
	if (skill.toggle === "none") throw new Error("This skill cannot be turned off from here");

	const base = baseOf(skill.scope, folder, home);
	const entries = readSkillEntries(folder, home, skill.scope);
	const rest = entries.filter((entry) => !excludes(entry, base, skill.dir));
	const next = enabled ? rest : [...rest, `-${skill.dir}`];
	if (next.length !== entries.length || next.some((entry, index) => entry !== entries[index])) {
		await writeSkillEntries(folder, home, skill.scope, next);
	}
	if (!enabled) return;
	const after = (await listSkills(folder, home, project)).find(
		(entry) => entry.filePath === filePath,
	);
	if (after?.status === "disabled") {
		throw new Error(
			`A pattern in the skills setting still excludes ${skill.name}. Edit settings.json to remove it.`,
		);
	}
};
