import { Schema } from "effect";

import { SkillRoot } from "#protocol/settings/skills";
import type { SkillView } from "#protocol/settings/skills";

/**
 * Which skill a route names. An editable skill is its `root` and `name`; any other is
 * its `path`, because two skills can share a name and only the file tells them apart.
 * A new skill takes only the `root` it will be written to. The open view and raw file
 * belong to the page, so a reload keeps them.
 */
export const skillSearchSchema = Schema.Struct({
	/** The project tab the list shows beside the agent home, when there is one. */
	project: Schema.optional(Schema.NonEmptyString),
	root: Schema.optional(SkillRoot),
	path: Schema.optional(Schema.NonEmptyString),
	tab: Schema.optional(Schema.Literals(["form", "raw"])),
	file: Schema.optional(Schema.NonEmptyString),
});

export type SkillSearch = typeof skillSearchSchema.Type;

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
