/**
 * A skill is a directory with a `SKILL.md`, so the dashboard writes plain files
 * instead of a pi format (docs/DECISIONS.md, Configure in the dashboard). Every
 * function works on one skills root: the directory that holds the skill folders.
 *
 * A save goes through the file's own YAML document, so keys the panel does not
 * manage and their comments survive. A file whose frontmatter does not parse is
 * read as raw text and never rewritten (AGENTS.md rule 4).
 *
 * The name arrives from a URL segment, so every path is resolved against the
 * skills root and refused when it escapes. The route validates the same name;
 * this is the check that keeps the guarantee true if a caller forgets.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { foreignBodySyntax, skillFieldOwner } from "shared";
import { stringify } from "yaml";

import { stringMapField, textField } from "./fields";
import type { SkillDocument, SkillField, SkillFile, SkillInput, SkillRoot } from "./contract";
import { emptySkillDocument, parseSkillFile, serializeSkillFile } from "./frontmatter";

/** The directory for a skill, refused if the name would leave the skills root. */
const skillDirectory = (root: string, name: string): string => {
	const base = resolve(root);
	const directory = resolve(base, name);
	const inside = relative(base, directory);
	if (inside === "" || inside.startsWith(`..${sep}`) || inside === "..") {
		throw new Error(`"${name}" is not a skill directory name`);
	}
	return directory;
};

/** The text of a file, or undefined when there is none. */
const readText = async (path: string): Promise<string | undefined> => {
	try {
		return await readFile(path, "utf8");
	} catch {
		return undefined;
	}
};

/** A `SKILL.md` as the page shows it: managed fields, the others read-only, or the raw text. */
const parseSkillDocument = (text: string, name: string, filePath: string): SkillDocument => {
	const parsed = parseSkillFile(text);
	if (!parsed.ok) {
		return {
			name,
			filePath,
			description: "",
			body: "",
			modelInvocation: true,
			fields: [],
			bodyWarnings: [],
			parseError: parsed.error,
			raw: text,
		};
	}
	const { fields, body } = parsed.file;
	const license = textField.safeParse(fields.license).data;
	const compatibility = textField.safeParse(fields.compatibility).data;
	const metadata = stringMapField.safeParse(fields.metadata).data;
	// A managed key whose value has another shape is shown as a field instead.
	const managed = new Set(["name", "description", "disable-model-invocation"]);
	if (license !== undefined) managed.add("license");
	if (compatibility !== undefined) managed.add("compatibility");
	if (metadata !== undefined) managed.add("metadata");
	const skillBody = body.trim();
	return {
		name,
		filePath,
		description: textField.safeParse(fields.description).data ?? "",
		body: skillBody,
		modelInvocation: fields["disable-model-invocation"] !== true,
		license,
		compatibility,
		metadata,
		fields: Object.entries(fields)
			.filter(([key]) => !managed.has(key))
			.map(([key, value]): SkillField => ({
				key,
				owner: skillFieldOwner(key),
				value: stringify(value).trimEnd(),
			})),
		bodyWarnings: foreignBodySyntax(skillBody),
	};
};

/** The full file, for the edit form. Undefined when the directory holds no `SKILL.md`. */
export const readSkillFile = async (
	root: string,
	rootKind: SkillRoot,
	name: string,
): Promise<SkillFile | undefined> => {
	const filePath = join(skillDirectory(root, name), "SKILL.md");
	const text = await readText(filePath);
	if (text === undefined) return undefined;
	return { root: rootKind, ...parseSkillDocument(text, name, filePath) };
};

/** Any `SKILL.md` the caller already knows is a listed skill, for display only. */
export const readSkillDocument = async (
	filePath: string,
	name: string,
): Promise<SkillDocument | undefined> => {
	const text = await readText(filePath);
	return text === undefined ? undefined : parseSkillDocument(text, name, filePath);
};

export const writeSkill = async (root: string, name: string, input: SkillInput): Promise<void> => {
	const directory = skillDirectory(root, name);
	const path = join(directory, "SKILL.md");
	const existing = await readText(path);
	let document = emptySkillDocument();
	if (existing !== undefined) {
		const parsed = parseSkillFile(existing);
		if (!parsed.ok) {
			throw new Error(
				`${path} was not changed: ${parsed.error}. Fix the frontmatter by hand, then save again.`,
			);
		}
		document = parsed.file.document;
	}
	const changes: Parameters<typeof serializeSkillFile>[1] = {
		name,
		description: input.description,
		"disable-model-invocation": input.modelInvocation ? undefined : true,
	};
	// An omitted field leaves the key alone; an empty one removes it.
	if (input.license !== undefined) changes.license = input.license.trim() || undefined;
	if (input.compatibility !== undefined) {
		changes.compatibility = input.compatibility.trim() || undefined;
	}
	if (input.metadata !== undefined) {
		changes.metadata = Object.keys(input.metadata).length === 0 ? undefined : input.metadata;
	}
	const text = serializeSkillFile(document, changes, input.body);
	await mkdir(directory, { recursive: true });
	await writeFile(path, text, "utf8");
};

/** Removes the skill directory, and nothing outside the skills root. */
export const removeSkill = async (root: string, name: string): Promise<void> => {
	const directory = skillDirectory(root, name);
	if ((await readText(join(directory, "SKILL.md"))) === undefined) return;
	await rm(directory, { recursive: true, force: true });
};
