/**
 * Format the whole document with Prettier, as an editor command (one undo step).
 * Prettier and its parsers load only when someone formats, so the editor chunk
 * stays small. Markdown keeps its YAML frontmatter; Prettier formats that too.
 */
import type { EditorView } from "@codemirror/view";

import type { CodeEditorLanguage } from "./code-editor";

const formatText = async (text: string, language: CodeEditorLanguage): Promise<string> => {
	const prettier = await import("prettier/standalone");
	if (language === "json") {
		const [babel, estree] = await Promise.all([
			import("prettier/plugins/babel"),
			import("prettier/plugins/estree"),
		]);
		return prettier.format(text, { parser: "json", plugins: [babel, estree], useTabs: false });
	}
	const [markdown, yaml] = await Promise.all([
		import("prettier/plugins/markdown"),
		import("prettier/plugins/yaml"),
	]);
	return prettier.format(text, {
		parser: "markdown",
		plugins: [markdown, yaml],
		proseWrap: "preserve",
	});
};

/** Whether this language has a formatter. Plain text has none. */
export const canFormat = (language: CodeEditorLanguage): boolean => language !== "text";

/**
 * Replace the document with its formatted text. Answers Prettier's first line of
 * complaint when the text does not parse, or undefined when it formatted.
 */
export const formatDocument = async (
	view: EditorView,
	language: CodeEditorLanguage,
): Promise<string | undefined> => {
	const before = view.state.doc.toString();
	let after: string;
	try {
		after = await formatText(before, language);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return message.split("\n")[0] ?? message;
	}
	// The text may have changed while Prettier loaded; formatting a stale copy would undo it.
	if (after === before || view.state.doc.toString() !== before) return undefined;
	view.dispatch({ changes: { from: 0, to: before.length, insert: after }, userEvent: "format" });
	return undefined;
};
