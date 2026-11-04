/**
 * The skill rules both sides run: pi's name and description limits, who owns a
 * frontmatter field, the body syntax another agent expands, and the frontmatter fence.
 *
 * The limits are pi's own (`dist/core/skills.js`), which follow the Agent Skills spec.
 * pi only warns on a bad name; Epsilon refuses to write one. A description may hold any
 * text: pi XML-escapes it into the system prompt.
 */

export const SKILL_NAME_MAX = 64;
export const SKILL_DESCRIPTION_MAX = 1024;

/** A directory name under a skills root, which is also the URL segment. */
export const isSkillName = (value: string): boolean =>
	value.length >= 1 && value.length <= SKILL_NAME_MAX && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);

/** pi does not load a skill without a non-empty description. */
export const skillDescriptionProblem = (value: string): string | undefined => {
	const trimmed = value.trim();
	if (trimmed === "") return "pi does not load a skill without a description";
	if (trimmed.length > SKILL_DESCRIPTION_MAX) {
		return `At most ${SKILL_DESCRIPTION_MAX} characters`;
	}
	return undefined;
};

/** The skill folder's own `SKILL.md`, or the one a skill's `filePath` names. */
export const SKILL_FILE_NAME = "SKILL.md";

/** pi marks a skill an extension discovered at runtime with this source prefix. */
export const EXTENSION_SKILL_SOURCE = "extension:";

/** The opening fence of a `SKILL.md`; the match ends at the closing fence and newline. */
export const SKILL_FENCE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Who reads a frontmatter field. `pi` fields change what the agent does; `spec` fields
 * are Agent Skills metadata pi parses and ignores; `claude-code` fields only Claude Code
 * honors. Anything not listed is `unknown`. All of them survive a save.
 */
export type SkillFieldOwner = "pi" | "spec" | "claude-code" | "unknown";

const skillFields: ReadonlyMap<string, SkillFieldOwner> = new Map([
	["name", "pi"],
	["description", "pi"],
	["disable-model-invocation", "pi"],
	["license", "spec"],
	["compatibility", "spec"],
	["metadata", "spec"],
	["allowed-tools", "spec"],
	["when_to_use", "claude-code"],
	["argument-hint", "claude-code"],
	["arguments", "claude-code"],
	["user-invocable", "claude-code"],
	["disallowed-tools", "claude-code"],
	["model", "claude-code"],
	["effort", "claude-code"],
	["context", "claude-code"],
	["agent", "claude-code"],
	["background", "claude-code"],
	["hooks", "claude-code"],
	["paths", "claude-code"],
	["shell", "claude-code"],
]);

export const skillFieldOwner = (key: string): SkillFieldOwner => skillFields.get(key) ?? "unknown";

/** Body syntax another agent expands and pi passes through as literal text. */
export const foreignBodySyntax = (body: string): ReadonlyArray<string> => {
	const found: string[] = [];
	if (/\$ARGUMENTS\b|\$\d\b/.test(body)) found.push("$ARGUMENTS");
	if (/!`[^`]+`/.test(body)) found.push("!`command`");
	return found;
};
