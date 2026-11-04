import { Option, Schema } from "effect";
import { Document, isMap, parseDocument, stringify } from "yaml";

import { SKILL_FENCE } from "../../../domain/skills/rules.ts";

/**
 * `SKILL.md` frontmatter, read and written through a YAML document, so a save keeps
 * every key, its order and its comments. A file whose frontmatter does not parse is
 * never rewritten: the caller reads it as raw text and refuses a save.
 */

/** One value a YAML mapping can hold, as `Document.toJS()` returns it. */
type FrontmatterValue =
	| string
	| number
	| boolean
	| null
	| readonly FrontmatterValue[]
	| { readonly [key: string]: FrontmatterValue };

/** Frontmatter keys to their values. Readers parse a value before trusting its shape. */
export type FrontmatterFields = { readonly [key: string]: FrontmatterValue };

/** Keys to set on a save; `undefined` removes the key. */
export type FrontmatterChanges = { [key: string]: FrontmatterValue | undefined };

export type ParsedSkillFile = {
	/** The frontmatter as plain values, for reading. */
	readonly fields: FrontmatterFields;
	readonly body: string;
	/** The document to edit; pass it back to `serializeSkillFile`. */
	readonly document: Document;
};

export type SkillFileParse =
	| { readonly ok: true; readonly file: ParsedSkillFile }
	| { readonly ok: false; readonly error: string };

/** Parses a whole `SKILL.md`. The opening `---` must be the first line. */
export const parseSkillFile = (text: string): SkillFileParse => {
	const match = SKILL_FENCE.exec(text);
	if (match === null) {
		return { ok: false, error: "SKILL.md must start with a --- frontmatter block" };
	}
	const document = parseDocument(match[1] ?? "");
	if (document.errors.length > 0) {
		return { ok: false, error: `Frontmatter is not valid YAML: ${document.errors[0]?.message}` };
	}
	if (document.contents !== null && !isMap(document.contents)) {
		return { ok: false, error: "Frontmatter must be a YAML mapping of fields" };
	}
	// SAFETY: the contents are a YAML map (checked above) or empty, and `toJS()` of a
	// map yields only scalars, arrays and plain objects, which `FrontmatterValue` covers.
	const fields = (document.toJS() ?? {}) as FrontmatterFields;
	return { ok: true, file: { body: text.slice(match[0].length), document, fields } };
};

/**
 * Writes a `SKILL.md`. `changes` sets each key it names; `undefined` removes the key.
 * Keys it does not name are kept as they were.
 */
export const serializeSkillFile = (
	document: Document,
	changes: FrontmatterChanges,
	body: string,
): string => {
	for (const [key, value] of Object.entries(changes)) {
		if (value === undefined) document.delete(key);
		else document.set(key, value);
	}
	const head = document.toString({ lineWidth: 0 }).trimEnd();
	const text = body.trim();
	return text === "" ? `---\n${head}\n---\n` : `---\n${head}\n---\n\n${text}\n`;
};

/** A document for a new skill, with no fields yet. */
export const emptySkillDocument = (): Document => new Document({});

/** A YAML value as the text the panel shows for a field it does not manage. */
export const yamlText = (value: FrontmatterValue): string => stringify(value).trimEnd();

/** A YAML value read as a string, or undefined for any other shape. */
export const textField = (value: FrontmatterValue | undefined): string | undefined =>
	Option.getOrUndefined(Schema.decodeUnknownOption(Schema.String)(value));

/** A YAML value read as a string map, or undefined for any other shape. */
export const stringMapField = (
	value: FrontmatterValue | undefined,
): Record<string, string> | undefined =>
	Option.getOrUndefined(
		Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.String))(value),
	);
