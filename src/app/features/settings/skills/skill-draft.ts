/**
 * The editable state of one skill page and the conversions around it: the draft the form
 * holds until Save, the check the server repeats, and the write input.
 */
import type { SkillFile, SkillInput, SkillView } from "#protocol/settings/skills";

import { skillDescriptionProblem, skillNameProblem } from "./rules.ts";
import { SKILL_BODY_STARTER } from "./skill-starter.ts";

/** What the form edits. Every other frontmatter key is kept by the server. */
export type SkillDraft = {
	name: string;
	description: string;
	modelInvocation: boolean;
	body: string;
};

/** The fields that can carry a message. */
export type SkillField = "name" | "description" | "body";

export const skillFields: readonly SkillField[] = ["name", "description", "body"];

export type SkillErrors = Partial<Record<SkillField, string>>;

export const toDraft = (file: SkillFile | undefined, name: string | undefined): SkillDraft => ({
	name: file?.name ?? name ?? "",
	description: file?.description ?? "",
	modelInvocation: file?.modelInvocation ?? true,
	// Only a new skill starts from the template; an existing empty body stays empty.
	body: file === undefined ? SKILL_BODY_STARTER : file.body,
});

/** Checks the draft the way the server will; returns one message per bad field. */
export const validate = (
	draft: SkillDraft,
	creating: boolean,
	taken: ReadonlySet<string>,
): SkillErrors => {
	const found: SkillErrors = {};
	if (creating) {
		const problem = skillNameProblem(draft.name);
		if (problem !== undefined) {
			found.name = draft.name.trim() === "" ? "A skill needs a name." : problem;
		} else if (taken.has(draft.name.trim())) {
			found.name = `A skill named ${draft.name} already exists here. Pick another name.`;
		}
	}
	const description = skillDescriptionProblem(draft.description);
	if (description !== undefined) {
		found.description =
			draft.description.trim() === "" ? "Say what the skill does and when to use it." : description;
	}
	return found;
};

/**
 * `license`, `compatibility` and `metadata` are left out, so the server keeps them as the
 * file has them; the Raw tab is where they are edited.
 */
export const toInput = (draft: SkillDraft): SkillInput => ({
	body: draft.body,
	description: draft.description.trim(),
	modelInvocation: draft.modelInvocation,
});

/** The listed skill row this page edits, for its status and switches. */
export const viewOf = (
	skills: ReadonlyArray<SkillView>,
	root: string,
	folder: string,
): SkillView | undefined => skills.find((skill) => skill.root === root && skill.folder === folder);
