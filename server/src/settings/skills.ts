/**
 * A skill is a directory with a `SKILL.md`, so the dashboard writes plain files
 * instead of a pi format (docs/adr/0012-configure-in-the-dashboard.md). The list
 * covers the user skills directory pi scans, `<agent home>/skills`; project and
 * package skills stay read-only here.
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import type { SkillInput, SkillView } from "shared";

import { skillsPath } from "./store";

/** The frontmatter fields the panel edits. Other fields stay in the body. */
const frontmatter = (text: string) => {
	if (!text.startsWith("---")) return { description: "", body: text };
	const end = text.indexOf("\n---", 3);
	if (end === -1) return { description: "", body: text };
	const head = text.slice(3, end);
	const body = text.slice(text.indexOf("\n", end + 1) + 1);
	const line = head.split("\n").find((entry) => entry.trimStart().startsWith("description:"));
	const raw = line?.slice(line.indexOf(":") + 1).trim() ?? "";
	const description =
		raw.startsWith("'") && raw.endsWith("'")
			? raw.slice(1, -1).replace(/''/g, "'")
			: raw.replace(/^["']|["']$/g, "");
	return { description, body };
};

const readSkill = async (home: string, name: string): Promise<SkillView | undefined> => {
	const path = join(skillsPath(home), name, "SKILL.md");
	try {
		const parsed = frontmatter(await readFile(path, "utf8"));
		return { name, description: parsed.description, path };
	} catch {
		return undefined;
	}
};

/** The full file, for the edit form. */
export const readSkillFile = async (
	home: string,
	name: string,
): Promise<SkillInput | undefined> => {
	const path = join(skillsPath(home), name, "SKILL.md");
	try {
		const parsed = frontmatter(await readFile(path, "utf8"));
		return { name, description: parsed.description, body: parsed.body.trim() };
	} catch {
		return undefined;
	}
};

export const listSkills = async (home: string): Promise<SkillView[]> => {
	let entries: Dirent[];
	try {
		entries = await readdir(skillsPath(home), { withFileTypes: true });
	} catch {
		return [];
	}
	const skills = await Promise.all(
		entries.filter((entry) => entry.isDirectory()).map((entry) => readSkill(home, entry.name)),
	);
	return skills
		.filter((skill): skill is SkillView => skill !== undefined)
		.sort((left, right) => left.name.localeCompare(right.name));
};

export const writeSkill = async (home: string, input: SkillInput): Promise<void> => {
	const path = join(skillsPath(home), input.name, "SKILL.md");
	await mkdir(join(skillsPath(home), input.name), { recursive: true });
	// Single quotes keep a colon in the description valid YAML; an apostrophe is
	// doubled, which is how YAML escapes it inside a quoted scalar.
	const description = input.description.replace(/'/g, "''");
	const text = `---\nname: ${input.name}\ndescription: '${description}'\n---\n\n${input.body.trim()}\n`;
	await writeFile(path, text, "utf8");
};

/** Removes the skill directory, and nothing outside the skills root. */
export const removeSkill = async (home: string, name: string): Promise<void> => {
	const path = join(skillsPath(home), name);
	const skill = await readSkill(home, name);
	if (skill === undefined) return;
	await rm(path, { recursive: true, force: true });
};
