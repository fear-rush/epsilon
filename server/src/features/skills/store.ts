/**
 * A skill is a directory with a `SKILL.md`, so the dashboard writes plain files
 * instead of a pi format (docs/DECISIONS.md, Configure in the dashboard). The list
 * covers the user skills directory pi scans, `<agent home>/skills`; project and
 * package skills stay read-only here.
 *
 * The name arrives from a URL segment, so every path is resolved against the
 * skills root and refused when it escapes. The route validates the same name;
 * this is the check that keeps the guarantee true if a caller forgets.
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import type { AgentHome } from "../../platform/agent-home";
import type { SkillInput, SkillView } from "./contract";

/** The directory for a skill, refused if the name would leave the skills root. */
const skillDirectory = (home: AgentHome, name: string): string => {
	const root = resolve(home.skillsDir);
	const directory = resolve(root, name);
	const inside = relative(root, directory);
	if (inside === "" || inside.startsWith(`..${sep}`) || inside === "..") {
		throw new Error(`"${name}" is not a skill directory name`);
	}
	return directory;
};

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

/** One skill's file, parsed. Undefined when the directory holds no skill. */
const readDocument = async (
	home: AgentHome,
	name: string,
): Promise<{ path: string; description: string; body: string } | undefined> => {
	const path = join(skillDirectory(home, name), "SKILL.md");
	try {
		const parsed = frontmatter(await readFile(path, "utf8"));
		return { path, description: parsed.description, body: parsed.body };
	} catch {
		return undefined;
	}
};

/** The full file, for the edit form. */
export const readSkillFile = async (
	home: AgentHome,
	name: string,
): Promise<SkillInput | undefined> => {
	const document = await readDocument(home, name);
	if (document === undefined) return undefined;
	return { name, description: document.description, body: document.body.trim() };
};

export const listSkills = async (home: AgentHome): Promise<SkillView[]> => {
	let entries: Dirent[];
	try {
		entries = await readdir(home.skillsDir, { withFileTypes: true });
	} catch {
		return [];
	}
	const skills = await Promise.all(
		entries
			.filter((entry) => entry.isDirectory())
			.map(async (entry) => {
				const document = await readDocument(home, entry.name);
				if (document === undefined) return undefined;
				return { name: entry.name, description: document.description, path: document.path };
			}),
	);
	return skills
		.filter((skill): skill is SkillView => skill !== undefined)
		.sort((left, right) => left.name.localeCompare(right.name));
};

export const writeSkill = async (home: AgentHome, input: SkillInput): Promise<void> => {
	const directory = skillDirectory(home, input.name);
	await mkdir(directory, { recursive: true });
	// Single quotes keep a colon in the description valid YAML; an apostrophe is
	// doubled, which is how YAML escapes it inside a quoted scalar.
	const description = input.description.replace(/'/g, "''");
	const text = `---\nname: ${input.name}\ndescription: '${description}'\n---\n\n${input.body.trim()}\n`;
	await writeFile(join(directory, "SKILL.md"), text, "utf8");
};

/** Removes the skill directory, and nothing outside the skills root. */
export const removeSkill = async (home: AgentHome, name: string): Promise<void> => {
	const directory = skillDirectory(home, name);
	const skill = await readDocument(home, name);
	if (skill === undefined) return;
	await rm(directory, { recursive: true, force: true });
};
