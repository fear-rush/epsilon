import type { SkillRoot, SkillView } from "#protocol/config/skills";

/** What the skills routes carry in their search string. */
export type SkillSearch = {
	readonly project?: string | undefined;
	readonly root?: SkillRoot | undefined;
	readonly path?: string | undefined;
};

/** A row's identity: an editable skill's root and folder, or a listed file's path. */
export const skillKey = (skill: SkillView): string =>
	skill.editable && skill.root !== undefined ? `${skill.root}\0${skill.folder}` : skill.filePath;

/** The search that opens this row, keeping the project the tab is showing. */
export const skillSearch = (skill: SkillView, previous: SkillSearch): SkillSearch => {
	const project = previous.project === undefined ? {} : { project: previous.project };
	return skill.editable && skill.root !== undefined
		? { ...project, root: skill.root }
		: { ...project, path: skill.filePath };
};
