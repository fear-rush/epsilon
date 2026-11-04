/**
 * The checks the editor runs on its own, by language: a JSON parse error, and a
 * markdown file's YAML frontmatter that does not parse. A caller's own checks
 * (the `diagnostics` prop) are added to these.
 */
import type { Diagnostic } from "@codemirror/lint";
import { parseDocument } from "yaml";

import type { CodeEditorLanguage } from "./code-editor";

/**
 * Where `JSON.parse` stopped, from its message ("at position N" or "line L column
 * C"). Safari names neither, so the parser's own error node is the fallback.
 */
const jsonErrorAt = (text: string, message: string, treeError: number | undefined): number => {
	const position = /position (\d+)/.exec(message);
	if (position !== null) return Number(position[1]);
	const lineColumn = /line (\d+) column (\d+)/.exec(message);
	if (lineColumn === null) return treeError ?? text.length;
	const lines = text.split("\n").slice(0, Number(lineColumn[1]) - 1);
	return lines.reduce((sum, line) => sum + line.length + 1, 0) + Number(lineColumn[2]) - 1;
};

const jsonChecks = (text: string, treeError: number | undefined): Diagnostic[] => {
	if (text.trim() === "") return [];
	try {
		JSON.parse(text);
		return [];
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const from = Math.min(jsonErrorAt(text, message, treeError), text.length);
		return [{ from, to: Math.min(from + 1, text.length), severity: "error", message }];
	}
};

const FENCE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

const frontmatterChecks = (text: string): Diagnostic[] => {
	if (!text.startsWith("---")) return [];
	const match = FENCE.exec(text);
	if (match === null) {
		return [{ from: 0, to: 3, severity: "error", message: "Frontmatter has no closing ---" }];
	}
	const start = text.indexOf("\n") + 1;
	const document = parseDocument(match[1] ?? "");
	return document.errors.map((problem) => {
		const [from, to] = problem.pos;
		return {
			from: start + from,
			to: Math.max(start + to, start + from + 1),
			severity: "error",
			message: problem.message.split("\n")[0] ?? problem.message,
		};
	});
};

/** `treeError` is where the editor's parser found its first error node, when it did. */
export const languageChecks = (
	text: string,
	language: CodeEditorLanguage,
	treeError?: number,
): Diagnostic[] => {
	if (language === "json") return jsonChecks(text, treeError);
	if (language === "markdown") return frontmatterChecks(text);
	return [];
};
