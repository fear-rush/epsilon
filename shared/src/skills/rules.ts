/**
 * The skill rules the browser and the server both run. The name and description
 * limits are pi's own (`dist/core/skills.js`), which follow the Agent Skills spec;
 * pi only warns on a bad name, Epsilon refuses to write one.
 */
import { z } from "zod";

export const SKILL_NAME_MAX = 64;
export const SKILL_DESCRIPTION_MAX = 1024;

/** The directory name under a skills root, the frontmatter `name`, and the URL segment. */
export const skillNameSchema = z
	.string()
	.min(1)
	.max(SKILL_NAME_MAX, `At most ${SKILL_NAME_MAX} characters`)
	.regex(
		/^[a-z0-9]+(-[a-z0-9]+)*$/,
		"Use lowercase letters, digits and single dashes, not at the start or end",
	);

export const skillDescriptionSchema = z
	.string()
	.trim()
	.min(1, "pi does not load a skill without a description")
	.max(SKILL_DESCRIPTION_MAX, `At most ${SKILL_DESCRIPTION_MAX} characters`)
	.refine((text) => !/<\/?[A-Za-z][^>]*>/.test(text), "No XML tags in the description");

/**
 * Who reads a frontmatter field. `pi` fields change what the agent does;
 * `spec` fields are Agent Skills metadata pi parses and ignores; `claude-code`
 * fields only Claude Code honors. Anything not listed is `unknown`. All of them
 * survive a save.
 */
export type SkillFieldOwner = "pi" | "spec" | "claude-code" | "unknown";

const SKILL_FIELDS = {
	name: "pi",
	description: "pi",
	"disable-model-invocation": "pi",
	license: "spec",
	compatibility: "spec",
	metadata: "spec",
	"allowed-tools": "spec",
	when_to_use: "claude-code",
	"argument-hint": "claude-code",
	arguments: "claude-code",
	"user-invocable": "claude-code",
	"disallowed-tools": "claude-code",
	model: "claude-code",
	effort: "claude-code",
	context: "claude-code",
	agent: "claude-code",
	background: "claude-code",
	hooks: "claude-code",
	paths: "claude-code",
	shell: "claude-code",
} as const satisfies Record<string, SkillFieldOwner>;

const isKnownField = (key: string): key is keyof typeof SKILL_FIELDS =>
	Object.hasOwn(SKILL_FIELDS, key);

export const skillFieldOwner = (key: string): SkillFieldOwner =>
	isKnownField(key) ? SKILL_FIELDS[key] : "unknown";

/** Body syntax another agent expands and pi passes through as literal text. */
export const foreignBodySyntax = (body: string): string[] => {
	const found: string[] = [];
	if (/\$ARGUMENTS\b|\$\d\b/.test(body)) found.push("$ARGUMENTS");
	if (/!`[^`]+`/.test(body)) found.push("!`command`");
	return found;
};
