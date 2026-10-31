/**
 * The editable state of one skill page and the conversions around it: the draft
 * the form holds until Save, the check the server repeats, and the write input.
 */
import { skillDescriptionSchema, skillNameSchema } from "shared";

import type { SkillFile, SkillInput } from "@/api/types";
import { SKILL_BODY_STARTER } from "./skill-starter";

export type SkillDraft = {
	name: string;
	description: string;
	modelInvocation: boolean;
	body: string;
};

export type SkillField = "name" | "description" | "body";

export const skillFields: readonly SkillField[] = ["name", "description", "body"];

export type SkillErrors = Partial<Record<SkillField, string>>;

export const toDraft = (detail: SkillFile | undefined): SkillDraft => ({
	name: detail?.name ?? "",
	description: detail?.description ?? "",
	modelInvocation: detail?.modelInvocation ?? true,
	// Only a new skill starts from the template; an existing empty body stays empty.
	body: detail === undefined ? SKILL_BODY_STARTER : (detail.body ?? ""),
});

/** Checks the draft the way the server will; returns one message per bad field. */
export const validate = (
	draft: SkillDraft,
	creating: boolean,
	taken: ReadonlySet<string>,
): SkillErrors => {
	const found: SkillErrors = {};
	if (creating) {
		const name = skillNameSchema.safeParse(draft.name);
		if (!name.success) {
			found.name = draft.name === "" ? "A skill needs a name." : name.error.issues[0]?.message;
		} else if (taken.has(draft.name)) {
			found.name = `A skill named ${draft.name} already exists here. Pick another name.`;
		}
	}
	const description = skillDescriptionSchema.safeParse(draft.description);
	if (!description.success) {
		found.description =
			draft.description.trim() === ""
				? "Say what the skill does and when to use it."
				: description.error.issues[0]?.message;
	}
	return found;
};

/** license, compatibility and metadata are left out, so the server keeps them as the file has them. */
export const toInput = (draft: SkillDraft): SkillInput => ({
	description: draft.description.trim(),
	body: draft.body,
	modelInvocation: draft.modelInvocation,
});
