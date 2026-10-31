/**
 * `SKILL.md` as plain text, for the Raw view. A read returns the file exactly; a
 * write is checked as a skill file and then stored byte for byte, so nothing the
 * person typed (comments, key order, spacing) is rewritten. The folder is found
 * the way the bundled files are, so a linked skill folder works here too.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { skillDescriptionSchema } from "shared";

import { textField } from "./fields";
import { skillFolder } from "./files";
import { parseSkillFile } from "./frontmatter";

/** The longest `SKILL.md` Raw opens or writes. */
const RAW_MAX_BYTES = 1024 * 1024;

/** Why `text` cannot be the `SKILL.md` of the skill folder `name`, or undefined. */
const rawSkillProblem = (text: string, name: string): string | undefined => {
	if (Buffer.byteLength(text, "utf8") > RAW_MAX_BYTES) {
		return `SKILL.md is larger than ${RAW_MAX_BYTES / 1024 / 1024} MB`;
	}
	const parsed = parseSkillFile(text);
	if (!parsed.ok) return parsed.error;
	const declared = textField.safeParse(parsed.file.fields.name).data;
	if (declared !== name) {
		return declared === undefined
			? `The frontmatter needs name: ${name}`
			: `The frontmatter name "${declared}" must match the folder name "${name}"`;
	}
	const description = skillDescriptionSchema.safeParse(
		textField.safeParse(parsed.file.fields.description).data ?? "",
	);
	return description.success ? undefined : description.error.issues[0]?.message;
};

/** The exact text of an editable skill's `SKILL.md`. */
export const readRawSkill = async (
	root: string,
	name: string,
	linkRoots: readonly string[] = [],
): Promise<string> => readFile(join(await skillFolder(root, name, linkRoots), "SKILL.md"), "utf8");

/** Replaces `SKILL.md` with `text` after the checks; a refusal changes nothing. */
export const writeRawSkill = async (
	root: string,
	name: string,
	text: string,
	linkRoots: readonly string[] = [],
): Promise<void> => {
	const directory = await skillFolder(root, name, linkRoots);
	const problem = rawSkillProblem(text, name);
	if (problem !== undefined) throw new Error(`SKILL.md was not changed: ${problem}`);
	await writeFile(join(directory, "SKILL.md"), text, "utf8");
};
