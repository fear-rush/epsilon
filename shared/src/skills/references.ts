/**
 * What a skill body says about other skills. pi loads a skill by reading its
 * `SKILL.md`, and a body can still name another one: `/skill:name`, or the way
 * Claude Code writes it, `Skill(name)` and "Skill tool with "name"". The reads
 * are pure so the preview and the page notice run the same ones.
 */
import { blankFencedCode, inlineCodeSpans } from "./body";

/** Where a body names another skill. */
export type SkillReference = {
	name: string;
	/** `/skill:name`, or Claude Code's `Skill(name)` call or "Skill tool" sentence. */
	kind: "command" | "claude-code";
	/** Offsets of the name alone in the body. */
	from: number;
	to: number;
};

const NAME = "[a-z0-9]+(?:-[a-z0-9]+)*";
const COMMAND = new RegExp(`(?<![\\w/])/skill:(${NAME})(?![\\w-])`, "g");
const CALL = new RegExp(`\\bSkill\\(\\s*["'\`]?(${NAME})["'\`]?\\s*\\)`, "g");
const SENTENCE = new RegExp(`\\bSkill tool\\b[^"'\`\\n]{0,30}["'\`](${NAME})["'\`]`, "g");
const TOOL = /\bSkill tool\b|\bSkill\(/;

/** Every named skill in the body, in document order. Code is read like prose. */
export const skillReferences = (body: string): SkillReference[] => {
	const found: SkillReference[] = [];
	const scan = (pattern: RegExp, kind: SkillReference["kind"], anchor: (m: string) => number) => {
		for (const match of body.matchAll(pattern)) {
			const name = match[1] ?? "";
			const from = match.index + anchor(match[0]) + match[0].slice(anchor(match[0])).indexOf(name);
			found.push({ name, kind, from, to: from + name.length });
		}
	};
	scan(COMMAND, "command", () => 0);
	scan(CALL, "claude-code", (text) => text.indexOf("(") + 1);
	scan(SENTENCE, "claude-code", (text) => text.search(/["'`]/));
	return found.sort((a, b) => a.from - b.from);
};

/** True when the body relies on Claude Code's Skill tool, which pi does not have. */
export const usesSkillTool = (body: string): boolean => TOOL.test(body);

/**
 * The body with each reference to a skill that `exists` turned into a markdown
 * link to `#skill:<name>`. A reference in prose links its name; one in an inline
 * code span links the whole span. Fenced code is left as written.
 */
export const linkSkillReferences = (body: string, exists: (name: string) => boolean): string => {
	const prose = blankFencedCode(body);
	const spans = inlineCodeSpans(body);
	const edits: { at: number; text: string }[] = [];
	const wrapped = new Set<number>();
	for (const ref of skillReferences(body)) {
		if (!exists(ref.name) || prose.slice(ref.from, ref.to) !== ref.name) continue;
		const span = spans.find((entry) => entry.from <= ref.from && ref.to <= entry.to);
		const target = `](#skill:${ref.name})`;
		if (span === undefined) {
			edits.push({ at: ref.from, text: "[" }, { at: ref.to, text: target });
		} else if (!wrapped.has(span.from)) {
			wrapped.add(span.from);
			edits.push({ at: span.from, text: "[" }, { at: span.to, text: target });
		}
	}
	let result = body;
	for (const edit of edits.sort((a, b) => b.at - a.at)) {
		result = result.slice(0, edit.at) + edit.text + result.slice(edit.at);
	}
	return result;
};

/** The `#skill:<name>` link target back to a name, or undefined for any other href. */
export const skillLinkName = (href: string): string | undefined =>
	href.startsWith("#skill:") ? href.slice("#skill:".length) : undefined;
