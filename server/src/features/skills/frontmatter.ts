/**
 * `SKILL.md` frontmatter, read and written through a YAML document so a save
 * keeps every key, its order and its comments. A file whose frontmatter does not
 * parse is never rewritten (AGENTS.md rule 4).
 */
import { Document, isMap, parseDocument } from "yaml";

/** One value a YAML mapping can hold, as `Document.toJS()` returns it. */
type FrontmatterValue =
	| string
	| number
	| boolean
	| null
	| readonly FrontmatterValue[]
	| { readonly [key: string]: FrontmatterValue };

/** Frontmatter keys to their values. Readers parse a value before trusting its shape. */
type FrontmatterFields = { readonly [key: string]: FrontmatterValue };

/** Keys to set on a save; `undefined` removes the key. */
export type FrontmatterChanges = { [key: string]: FrontmatterValue | undefined };

type ParsedSkillFile = {
	/** The frontmatter as plain values, for reading. */
	readonly fields: FrontmatterFields;
	readonly body: string;
	/** The document to edit; pass it back to `serializeSkillFile`. */
	readonly document: Document;
};

export type SkillFileParse =
	| { readonly ok: true; readonly file: ParsedSkillFile }
	| { readonly ok: false; readonly error: string };

const FENCE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Parses a whole `SKILL.md`. The opening `---` must be the first line. */
export const parseSkillFile = (text: string): SkillFileParse => {
	const match = FENCE.exec(text);
	if (match === null)
		return { ok: false, error: "SKILL.md must start with a --- frontmatter block" };
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
	return { ok: true, file: { fields, body: text.slice(match[0].length), document } };
};

/**
 * Writes a `SKILL.md`. `changes` sets each key it names; `undefined` removes the
 * key. Keys it does not name are kept as they were.
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
	return `---\n${head}\n---\n\n${body.trim()}\n`;
};

/** A document for a new skill, with no fields yet. */
export const emptySkillDocument = (): Document => new Document({});
