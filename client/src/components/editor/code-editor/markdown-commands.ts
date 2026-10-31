import { EditorSelection, type ChangeSpec, type SelectionRange } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/**
 * Toolbar and shortcut actions. Each one is a single transaction over the
 * selection, so it undoes in one step and never touches text it was not asked to.
 */

export type EditorCommand = (view: EditorView) => boolean;

const wrapRange =
	(state: EditorView["state"], before: string, after: string, placeholder: string) =>
	(range: SelectionRange) => {
		const { doc } = state;
		const selected = doc.sliceString(range.from, range.to);
		// Already wrapped just outside the selection: take the marks off.
		const outerBefore = doc.sliceString(Math.max(0, range.from - before.length), range.from);
		const outerAfter = doc.sliceString(range.to, Math.min(doc.length, range.to + after.length));
		if (range.empty === false && outerBefore === before && outerAfter === after) {
			return {
				changes: [
					{ from: range.from - before.length, to: range.from },
					{ from: range.to, to: range.to + after.length },
				] satisfies ChangeSpec[],
				range: EditorSelection.range(range.from - before.length, range.to - before.length),
			};
		}
		const inner = selected === "" ? placeholder : selected;
		return {
			changes: { from: range.from, to: range.to, insert: before + inner + after },
			range: EditorSelection.range(
				range.from + before.length,
				range.from + before.length + inner.length,
			),
		};
	};

/** Wrap the selection in marks (`**`), or insert marks around a placeholder. */
const wrapSelection =
	(before: string, after: string, placeholder: string): EditorCommand =>
	(view) => {
		if (view.state.readOnly) return false;
		view.dispatch(view.state.changeByRange(wrapRange(view.state, before, after, placeholder)), {
			userEvent: "input.format",
			scrollIntoView: true,
		});
		return true;
	};

export const bold = wrapSelection("**", "**", "bold text");
export const italic = wrapSelection("*", "*", "italic text");
export const inlineCode = wrapSelection("`", "`", "code");

/** `[text](url)` with the url selected, or the text selected when the url is already there. */
export const link: EditorCommand = (view) => {
	if (view.state.readOnly) return false;
	view.dispatch(
		view.state.changeByRange((range) => {
			const text = view.state.doc.sliceString(range.from, range.to) || "link text";
			const url = "https://";
			const insert = `[${text}](${url})`;
			const start = range.from + text.length + 3;
			return {
				changes: { from: range.from, to: range.to, insert },
				range: EditorSelection.range(start, start + url.length),
			};
		}),
		{ userEvent: "input.format", scrollIntoView: true },
	);
	return true;
};

/** Add a prefix to every touched line, or remove it when all of them have it. */
const prefixLines =
	(prefix: (index: number) => string, has: RegExp): EditorCommand =>
	(view) => {
		if (view.state.readOnly) return false;
		const { doc } = view.state;
		const changes: ChangeSpec[] = [];
		const seen = new Set<number>();
		const lines = view.state.selection.ranges.flatMap((range) => {
			const first = doc.lineAt(range.from).number;
			const last = doc.lineAt(range.to).number;
			const out = [];
			for (let n = first; n <= last; n++) {
				if (!seen.has(n)) {
					seen.add(n);
					out.push(doc.line(n));
				}
			}
			return out;
		});
		const filled = lines.filter((line) => line.text.trim() !== "");
		const allHave = filled.length > 0 && filled.every((line) => has.test(line.text));
		let index = 0;
		for (const line of lines) {
			if (allHave) {
				const match = has.exec(line.text);
				if (match) changes.push({ from: line.from, to: line.from + match[0].length });
			} else if (line.text.trim() !== "" || lines.length === 1) {
				// A heading replaces another heading's marks instead of stacking them.
				const old = /^#{1,6} /.exec(line.text);
				changes.push({
					from: line.from,
					to: line.from + (old && prefix(0).startsWith("#") ? old[0].length : 0),
					insert: prefix(index++),
				});
			}
		}
		view.dispatch({ changes, userEvent: "input.format", scrollIntoView: true });
		return true;
	};

export const heading = prefixLines(() => "## ", /^#{1,6} /);
export const bulletList = prefixLines(() => "- ", /^[-*+] /);
export const numberedList = prefixLines((index) => `${index + 1}. `, /^\d+[.)] /);

/** Fence the selected lines, or open an empty fence on its own lines. */
export const codeBlock: EditorCommand = (view) => {
	if (view.state.readOnly) return false;
	view.dispatch(
		view.state.changeByRange((range) => {
			const { doc } = view.state;
			const from = doc.lineAt(range.from);
			const to = doc.lineAt(range.to);
			const body = doc.sliceString(from.from, to.to);
			if (range.empty && from.text.trim() === "") {
				const insert = "```\n\n```";
				return {
					changes: { from: from.from, to: from.to, insert },
					range: EditorSelection.cursor(from.from + 4),
				};
			}
			const insert = `\`\`\`\n${body}\n\`\`\``;
			return {
				changes: { from: from.from, to: to.to, insert },
				range: EditorSelection.range(from.from + 4, from.from + 4 + body.length),
			};
		}),
		{ userEvent: "input.format", scrollIntoView: true },
	);
	return true;
};

/** Insert `[name](path)` at the cursor, or around the selected text, in one transaction. */
export const fileReference =
	(name: string, path: string): EditorCommand =>
	(view) => {
		if (view.state.readOnly) return false;
		// A space ends a bare destination, so a path with one is written in <>.
		const target = /\s/.test(path) ? `<${path}>` : path;
		view.dispatch(
			view.state.changeByRange((range) => {
				const text = view.state.doc.sliceString(range.from, range.to) || name;
				const insert = `[${text}](${target})`;
				return {
					changes: { from: range.from, to: range.to, insert },
					range: EditorSelection.cursor(range.from + insert.length),
				};
			}),
			{ userEvent: "input.format", scrollIntoView: true },
		);
		return true;
	};
