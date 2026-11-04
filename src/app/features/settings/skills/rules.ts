/** pi's own limits for a skill's folder name and description, which the panel enforces. */
export const SKILL_NAME_MAX = 64;
export const SKILL_DESCRIPTION_MAX = 1024;

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A folder name under a skills root, which is also the URL segment. */
export const skillNameProblem = (name: string): string | undefined => {
	const trimmed = name.trim();
	if (trimmed === "") return "A skill needs a name";
	if (trimmed.length > SKILL_NAME_MAX) return `At most ${SKILL_NAME_MAX} characters`;
	if (!NAME_PATTERN.test(trimmed)) {
		return "Use lowercase letters, digits and single dashes, not at the start or end";
	}
	return undefined;
};

export const skillDescriptionProblem = (description: string): string | undefined => {
	const trimmed = description.trim();
	if (trimmed === "") return "pi does not load a skill without a description";
	if (trimmed.length > SKILL_DESCRIPTION_MAX) {
		return `At most ${SKILL_DESCRIPTION_MAX} characters`;
	}
	return undefined;
};
