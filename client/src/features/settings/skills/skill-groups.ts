import type { SkillView } from "@/api/types";

type SkillOrigin = SkillView["origin"];

/**
 * The headings of the skill list. Pi reads skills from several places and the
 * list keeps them apart so a row says where its skill lives. A project tab lists
 * only the project's own skills: its `.agents/skills` and `.pi/skills`, and the
 * packages, settings paths and extensions scoped to it. A folder above the
 * project and the global groups never show there.
 */
export type SkillGroup = {
	id: string;
	/** Absent for the project's own skills, which the tab already names. */
	title?: string;
	skills: SkillView[];
};

const ORIGIN_TITLES: Record<SkillOrigin, string> = {
	home: "Agent home",
	"user-agents": "~/.agents/skills",
	"project-pi": ".pi/skills",
	"project-agents": ".agents/skills",
	"settings-path": "Settings paths",
	package: "Packages",
	extension: "Extensions",
};

const GLOBAL_ORDER: readonly SkillOrigin[] = [
	"home",
	"user-agents",
	"settings-path",
	"package",
	"extension",
];

/** Origins that are one skills folder, titled by its path. */
const FOLDER_ORIGINS: ReadonlySet<SkillOrigin> = new Set(["home", "user-agents"]);

const PROJECT_EXTRA: readonly SkillOrigin[] = ["settings-path", "package", "extension"];

/** The skills folder a skill sits in: the parent of its own folder. */
const containerOf = (skill: SkillView): string => skill.dir.slice(0, skill.dir.lastIndexOf("/"));

export function groupSkills(
	skills: readonly SkillView[],
	project: { name: string; path: string } | undefined,
): SkillGroup[] {
	const groups: SkillGroup[] = [];
	if (project !== undefined) {
		const ownFolders = new Set([`${project.path}/.agents/skills`, `${project.path}/.pi/skills`]);
		const own = skills.filter(
			(skill) =>
				skill.scope === "project" &&
				(skill.origin === "project-agents" || skill.origin === "project-pi") &&
				ownFolders.has(containerOf(skill)),
		);
		groups.push({ id: "project", skills: own });
		for (const origin of PROJECT_EXTRA) {
			groups.push(
				fromOrigin(`project:${origin}`, ORIGIN_TITLES[origin], origin, skills, "project"),
			);
		}
	} else {
		for (const origin of GLOBAL_ORDER) {
			const group = fromOrigin(`user:${origin}`, ORIGIN_TITLES[origin], origin, skills, "user");
			// A folder origin is titled with the folder itself, not a name for it.
			const first = group.skills[0];
			const folder =
				FOLDER_ORIGINS.has(origin) && first !== undefined ? containerOf(first) : undefined;
			groups.push(folder === undefined ? group : { ...group, title: folder });
		}
	}
	return groups.filter((group) => group.skills.length > 0);
}

const fromOrigin = (
	id: string,
	title: string,
	origin: SkillOrigin,
	skills: readonly SkillView[],
	scope: SkillView["scope"],
): SkillGroup => ({
	id,
	title,
	skills: skills.filter((skill) => skill.origin === origin && skill.scope === scope),
});
