/**
 * Skill folders other coding agents own: Claude Code's and Codex's. They are
 * listed from disk through pi's own loader and never copied or linked on disk.
 * "Linked" means the folder is in the `skills` setting, so pi loads it from
 * where it is; unlinking removes that entry and nothing else.
 */
import { join, resolve } from "node:path";

import type { AgentHome } from "../../platform/agent-home";
import { loadSkillFolder, readSkillEntries, writeSkillEntries } from "../../platform/pi";
import type { ForeignAgent, ForeignSkillView } from "./contract";

type ForeignFolder = {
	agent: ForeignAgent;
	scope: "user" | "project";
	dir: string;
};

/** The folders to look in. A project's `.claude/skills` counts only with a project picked. */
const candidates = (userHome: string, project: string | null): ForeignFolder[] => [
	{ agent: "claude-code", scope: "user", dir: join(userHome, ".claude", "skills") },
	{ agent: "codex", scope: "user", dir: join(userHome, ".codex", "skills") },
	...(project === null
		? []
		: [
				{
					agent: "claude-code" as const,
					scope: "project" as const,
					dir: join(project, ".claude", "skills"),
				},
			]),
];

/** The directory a `skills` entry names, or undefined for an override pattern. */
const entryDir = (entry: string, base: string, userHome: string): string | undefined => {
	if (/^[!+-]/.test(entry)) return undefined;
	if (entry === "~") return userHome;
	if (entry.startsWith("~/")) return join(userHome, entry.slice(2));
	return resolve(base, entry);
};

const baseOf = (scope: "user" | "project", folder: string, home: AgentHome): string =>
	scope === "user" ? home.dir : resolve(folder, ".pi");

const linkedEntries = (
	folder: string,
	home: AgentHome,
	userHome: string,
	target: ForeignFolder,
): string[] =>
	readSkillEntries(folder, home, target.scope).filter(
		(entry) => entryDir(entry, baseOf(target.scope, folder, home), userHome) === target.dir,
	);

/**
 * Every skill in the other agents' folders that exist. `folder` is the settings
 * folder (chats folder or project), `project` the project or null.
 */
export const listForeignSkills = (
	folder: string,
	home: AgentHome,
	userHome: string,
	project: string | null,
): ForeignSkillView[] =>
	candidates(userHome, project).flatMap((target) => {
		const { skills, diagnostics } = loadSkillFolder(target.dir);
		const linked = linkedEntries(folder, home, userHome, target).length > 0;
		return skills.map((skill) => ({
			agent: target.agent,
			scope: target.scope,
			folder: target.dir,
			linked,
			name: skill.name,
			description: skill.description,
			filePath: skill.filePath,
			warnings: diagnostics
				.filter((entry) => entry.type !== "collision" && entry.path === skill.filePath)
				.map((entry) => entry.message),
		}));
	});

/** The detected folder a browser-sent path names, or a refusal. Arbitrary paths are not linked. */
const detected = (dir: string, userHome: string, project: string | null): ForeignFolder => {
	const found = candidates(userHome, project).find((target) => target.dir === resolve(dir));
	if (found === undefined) throw new Error(`${dir} is not a skill folder of another agent`);
	return found;
};

/** Adds the folder to the `skills` setting of the file that owns it. */
export const linkSkillFolder = async (
	folder: string,
	home: AgentHome,
	userHome: string,
	project: string | null,
	dir: string,
): Promise<void> => {
	const target = detected(dir, userHome, project);
	if (linkedEntries(folder, home, userHome, target).length > 0) return;
	await writeSkillEntries(folder, home, target.scope, [
		...readSkillEntries(folder, home, target.scope),
		target.dir,
	]);
};

/** Removes every entry that names the folder from the `skills` setting. */
export const unlinkSkillFolder = async (
	folder: string,
	home: AgentHome,
	userHome: string,
	project: string | null,
	dir: string,
): Promise<void> => {
	const target = detected(dir, userHome, project);
	const names = new Set(linkedEntries(folder, home, userHome, target));
	if (names.size === 0) return;
	await writeSkillEntries(
		folder,
		home,
		target.scope,
		readSkillEntries(folder, home, target.scope).filter((entry) => !names.has(entry)),
	);
};
