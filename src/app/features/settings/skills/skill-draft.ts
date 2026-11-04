import type { SkillFile, SkillInput, SkillView } from "#protocol/settings/skills";

import { skillDescriptionProblem, skillNameProblem } from "./rules.ts";
import { SKILL_BODY_STARTER } from "./skill-starter.ts";

/** What the form edits. Every other frontmatter key is kept by the server. */
export type SkillDraft = {
	name: string;
	description: string;
	modelInvocation: boolean;
	license: string;
	compatibility: string;
	body: string;
};

/** The fields that can carry a message. */
export const SKILL_FIELDS = ["name", "description"] as const;
export type SkillField = (typeof SKILL_FIELDS)[number];

export const toDraft = (file: SkillFile | undefined, name: string | undefined): SkillDraft => ({
	name: file?.name ?? name ?? "",
	description: file?.description ?? "",
	modelInvocation: file?.modelInvocation ?? true,
	license: file?.license ?? "",
	compatibility: file?.compatibility ?? "",
	body: file?.body ?? SKILL_BODY_STARTER,
});

/** A blank optional field removes that key; a blank required one refuses the save. */
export const toInput = (draft: SkillDraft): SkillInput => ({
	body: draft.body,
	compatibility: draft.compatibility.trim(),
	description: draft.description.trim(),
	license: draft.license.trim(),
	modelInvocation: draft.modelInvocation,
});

/** Every problem the form can catch before the server is asked. */
export const validate = (
	draft: SkillDraft,
	creating: boolean,
	taken: ReadonlySet<string>,
): Partial<Record<SkillField, string>> => {
	const errors: Partial<Record<SkillField, string>> = {};
	if (creating) {
		const problem = skillNameProblem(draft.name);
		if (problem !== undefined) errors.name = problem;
		else if (taken.has(draft.name.trim())) errors.name = "A skill with that name is already here";
	}
	const description = skillDescriptionProblem(draft.description);
	if (description !== undefined) errors.description = description;
	return errors;
};

/** The listed skill row this page edits, for its status and switches. */
export const viewOf = (
	skills: ReadonlyArray<SkillView>,
	root: string,
	folder: string,
): SkillView | undefined => skills.find((skill) => skill.root === root && skill.folder === folder);
