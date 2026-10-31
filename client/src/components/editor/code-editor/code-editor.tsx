/**
 * A controlled CodeMirror 6 editor for any text file. The text is the document:
 * nothing is rewritten, normalised or rendered in place, so what is saved is
 * exactly what was typed. `value` flows in, `onChange` flows out; an outside
 * change is applied as the smallest edit, so the cursor stays where it was.
 *
 * It edits like a small VS Code: line numbers, folding, a problems gutter, the
 * language's own checks (JSON parse errors, YAML frontmatter) plus the caller's,
 * Prettier formatting on ⇧⌥F or the status bar button, and a status bar with the
 * cursor position and the problem count.
 *
 * It lives in `components/` because the skill body is only the first file it
 * edits; the skill's bundled files and MCP entries use it too.
 */
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
	bracketMatching,
	foldGutter,
	foldKeymap,
	indentOnInput,
	syntaxTree,
} from "@codemirror/language";
import {
	diagnosticCount,
	forceLinting,
	linter,
	lintGutter,
	lintKeymap,
	type Diagnostic,
} from "@codemirror/lint";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Annotation, Compartment, EditorState, Prec, type Extension } from "@codemirror/state";
import {
	drawSelection,
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	keymap,
	lineNumbers,
	placeholder as placeholderExtension,
} from "@codemirror/view";
import { cn } from "@/lib/cn";
import { useEffect, useRef, useState } from "react";

import { languageChecks } from "./checks";
import { canFormat, formatDocument } from "./format";
import { bold, italic, link } from "./markdown-commands";
import { editorTheme } from "./theme";

export type CodeEditorLanguage = "markdown" | "json" | "text";

/** Marks a transaction that came from `value`, so it is not reported as an edit. */
const fromProps = Annotation.define<boolean>();

const languageExtension = (language: CodeEditorLanguage): Extension => {
	if (language === "markdown") return markdown({ base: markdownLanguage });
	if (language === "json") return json();
	return [];
};

const LANGUAGE_NAMES: Record<CodeEditorLanguage, string> = {
	markdown: "Markdown",
	json: "JSON",
	text: "Plain text",
};

type Status = { line: number; column: number; problems: number };

const statusOf = (state: EditorState): Status => {
	const head = state.selection.main.head;
	const line = state.doc.lineAt(head);
	return { line: line.number, column: head - line.from + 1, problems: diagnosticCount(state) };
};

/** The start of the first error node the language's parser produced, if any. */
const firstTreeError = (state: EditorState): number | undefined => {
	let found: number | undefined;
	syntaxTree(state).iterate({
		enter: (node) => {
			if (found !== undefined) return false;
			if (node.type.isError) found = node.from;
			return undefined;
		},
	});
	return found;
};

const lockExtension = (readOnly: boolean): Extension => [
	EditorState.readOnly.of(readOnly),
	EditorView.editable.of(!readOnly),
];

export function CodeEditor({
	value,
	onChange,
	language,
	readOnly = false,
	id,
	label,
	placeholder,
	diagnostics,
	onView,
	statusBar = true,
	className,
}: {
	value: string;
	/** Called with the whole text after each edit the person makes. Omit it when read-only. */
	onChange?: (value: string) => void;
	language: CodeEditorLanguage;
	readOnly?: boolean;
	id?: string;
	/** The accessible name; the editor is a contenteditable, so a `<label for>` cannot name it. */
	label: string;
	placeholder?: string;
	/** Marks to draw in the text. Read on every edit and whenever this function changes. */
	diagnostics?: (text: string) => Diagnostic[];
	/** Receives the view once it exists (and null when it goes), for toolbars to dispatch to. */
	onView?: (view: EditorView | null) => void;
	/** The bottom bar with the cursor position, the problem count and Format. */
	statusBar?: boolean;
	/** Size the box here (a height); the editor fills it and scrolls inside. */
	className?: string;
}) {
	const host = useRef<HTMLDivElement>(null);
	const view = useRef<EditorView | null>(null);
	const languageSlot = useRef(new Compartment());
	const lockSlot = useRef(new Compartment());
	// Callbacks are read at call time, so the view is built once and never rebuilt for a new closure.
	const onChangeRef = useRef(onChange);
	const diagnosticsRef = useRef(diagnostics);
	const onViewRef = useRef(onView);
	const languageRef = useRef(language);
	onChangeRef.current = onChange;
	diagnosticsRef.current = diagnostics;
	onViewRef.current = onView;
	languageRef.current = language;
	const [status, setStatus] = useState<Status>({ line: 1, column: 1, problems: 0 });
	const [formatProblem, setFormatProblem] = useState<string | undefined>();

	const format = (): boolean => {
		const editor = view.current;
		if (editor === null || readOnly || !canFormat(languageRef.current)) return false;
		setFormatProblem(undefined);
		void formatDocument(editor, languageRef.current).then((problem) =>
			setFormatProblem(problem === undefined ? undefined : `Cannot format: ${problem}`),
		);
		return true;
	};
	const formatRef = useRef(format);
	formatRef.current = format;

	useEffect(() => {
		if (host.current === null) return;
		const editor = new EditorView({
			parent: host.current,
			state: EditorState.create({
				doc: value,
				extensions: [
					lineNumbers(),
					highlightActiveLineGutter(),
					foldGutter(),
					lintGutter(),
					history(),
					drawSelection(),
					indentOnInput(),
					bracketMatching(),
					closeBrackets(),
					highlightActiveLine(),
					EditorView.lineWrapping,
					search({ top: true }),
					highlightSelectionMatches(),
					linter(
						(current) => {
							const text = current.state.doc.toString();
							return [
								...languageChecks(text, languageRef.current, firstTreeError(current.state)),
								...(diagnosticsRef.current?.(text) ?? []),
							];
						},
						{ delay: 250 },
					),
					Prec.high(
						keymap.of([
							{ key: "Mod-b", run: bold },
							{ key: "Mod-i", run: italic },
							{ key: "Mod-k", run: link },
							{ key: "Shift-Alt-f", run: () => formatRef.current() },
						]),
					),
					keymap.of([
						...closeBracketsKeymap,
						...searchKeymap,
						...foldKeymap,
						...lintKeymap,
						...historyKeymap,
						...defaultKeymap,
						indentWithTab,
					]),
					languageSlot.current.of(languageExtension(language)),
					lockSlot.current.of(lockExtension(readOnly)),
					EditorView.contentAttributes.of({
						"aria-label": label,
						spellcheck: language === "markdown" ? "true" : "false",
					}),
					id === undefined ? [] : EditorView.contentAttributes.of({ id }),
					placeholder === undefined ? [] : placeholderExtension(placeholder),
					editorTheme,
					EditorView.updateListener.of((update) => {
						setStatus(statusOf(update.state));
						if (!update.docChanged) return;
						if (update.transactions.some((tr) => tr.annotation(fromProps) === true)) return;
						onChangeRef.current?.(update.state.doc.toString());
					}),
				],
			}),
		});
		view.current = editor;
		onViewRef.current?.(editor);
		return () => {
			onViewRef.current?.(null);
			editor.destroy();
			view.current = null;
		};
		// The view is created once; every later prop change has its own effect below.
		// oxlint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const editor = view.current;
		if (editor === null) return;
		const current = editor.state.doc.toString();
		if (current === value) return;
		// Replace only the span that differs, so the cursor and scroll position survive.
		let start = 0;
		while (start < current.length && start < value.length && current[start] === value[start])
			start++;
		let endCurrent = current.length;
		let endValue = value.length;
		while (
			endCurrent > start &&
			endValue > start &&
			current[endCurrent - 1] === value[endValue - 1]
		) {
			endCurrent--;
			endValue--;
		}
		editor.dispatch({
			changes: { from: start, to: endCurrent, insert: value.slice(start, endValue) },
			annotations: fromProps.of(true),
		});
	}, [value]);

	useEffect(() => {
		const editor = view.current;
		if (editor === null) return;
		editor.dispatch({ effects: languageSlot.current.reconfigure(languageExtension(language)) });
		forceLinting(editor);
	}, [language]);

	useEffect(() => {
		view.current?.dispatch({ effects: lockSlot.current.reconfigure(lockExtension(readOnly)) });
	}, [readOnly]);

	useEffect(() => {
		if (view.current !== null) forceLinting(view.current);
	}, [diagnostics]);

	return (
		<div
			className={cn(
				"flex min-h-0 flex-col overflow-hidden rounded-xl border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30",
				readOnly && "bg-muted/40 dark:bg-muted/30",
				className,
			)}
		>
			<div ref={host} className="min-h-0 flex-1" />
			{statusBar && (
				<div className="flex h-7 shrink-0 items-center gap-3 border-t px-3 text-[0.6875rem] text-muted-foreground tabular-nums">
					<span>
						Ln {status.line}, Col {status.column}
					</span>
					<span className={cn(status.problems > 0 && "text-destructive")}>
						{status.problems === 0
							? "No problems"
							: `${status.problems} ${status.problems === 1 ? "problem" : "problems"}`}
					</span>
					{formatProblem !== undefined && (
						<span className="min-w-0 truncate text-destructive" title={formatProblem}>
							{formatProblem}
						</span>
					)}
					<span className="ml-auto">{LANGUAGE_NAMES[language]}</span>
					{!readOnly && canFormat(language) && (
						<button
							type="button"
							className="rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
							title="Format (⇧⌥F)"
							onClick={() => {
								format();
								view.current?.focus();
							}}
						>
							Format
						</button>
					)}
				</div>
			)}
		</div>
	);
}
