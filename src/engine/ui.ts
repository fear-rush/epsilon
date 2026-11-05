import type {
	AutocompleteProviderFactory,
	ExtensionUIContext,
	ExtensionWidgetOptions,
	Theme,
	ThemeBg,
	ThemeColor,
} from "@earendil-works/pi-coding-agent";
import { Effect, Option } from "effect";

import type { DialogAnswer, DialogQuestion } from "#protocol/conversation/extui";

import type { AskOptions, Dialogs } from "./dialogs.ts";

/**
 * pi's `ExtensionUIContext`, mapped onto the browser's dialogs and notices.
 *
 * This is the engine's Promise boundary, the way `src/app/runtime.ts` is the app's: pi
 * hands extensions Promises, so this file runs the dialog Effect and answers with its
 * value. Everywhere else in the engine yields Effects.
 *
 * A method with no wire yet is refused once per method with a notice, never silently
 * dropped (AGENTS.md, "Every failure is visible"). Keyed statuses and widgets have a frame;
 * the working label and the editor text do not yet.
 */

export type UiHost = {
	readonly ask: (question: DialogQuestion, options?: AskOptions) => Promise<DialogAnswer>;
	readonly notice: (message: string, kind: "notice" | "warning" | "error") => void;
	readonly editorText: () => string;
	readonly addAutocompleteProvider: (factory: AutocompleteProviderFactory) => void;
	/** One keyed status line, or its removal when `text` is undefined. */
	readonly setStatus: (key: string, text: string | undefined) => void;
	/** One keyed widget above or below the composer, or its removal when `lines` is undefined. */
	readonly setWidget: (
		key: string,
		lines: ReadonlyArray<string> | undefined,
		placement: "aboveEditor" | "belowEditor" | undefined,
	) => void;
	readonly unsupported: (method: string) => void;
	readonly toolsExpanded: () => boolean;
	readonly setToolsExpanded: (expanded: boolean) => void;
};

type QuestionOptions = { readonly signal?: AbortSignal; readonly timeoutMs?: number };
type MutableQuestionOptions = { signal?: AbortSignal; timeoutMs?: number };

/** Only the options pi actually supplied; `exactOptionalPropertyTypes` is on. */
const questionOptions = (opts?: {
	readonly signal?: AbortSignal;
	readonly timeout?: number;
}): QuestionOptions => {
	const answer: MutableQuestionOptions = {};
	if (opts?.signal !== undefined) answer.signal = opts.signal;
	if (opts?.timeout !== undefined) answer.timeoutMs = opts.timeout;
	return answer;
};

export class UiBridge {
	/** The composer's draft as the tab last reported it; empty until one attaches. */
	private editor = "";
	/** pi's session-wide tool-card expansion; pi's own default is collapsed. */
	private expanded = false;
	/** The autocomplete factories extensions registered, in pi's wrapping order. */
	private wrappers: AutocompleteProviderFactory[] = [];
	readonly host: UiHost;

	constructor(
		dialogs: Dialogs,
		unsupported: (method: string) => void,
		notice: UiHost["notice"],
		setStatus: UiHost["setStatus"],
		setWidget: UiHost["setWidget"],
	) {
		this.host = {
			ask: (question, options) => Effect.runPromise(dialogs.ask(question, options)),
			notice,
			editorText: () => this.editor,
			addAutocompleteProvider: (factory) => {
				this.wrappers.push(factory);
			},
			setStatus,
			setWidget,
			unsupported,
			toolsExpanded: () => this.expanded,
			setToolsExpanded: (expanded) => {
				this.expanded = expanded;
			},
		};
	}

	setEditorText(text: string): void {
		this.editor = text;
	}

	get autocompleteProviders(): ReadonlyArray<AutocompleteProviderFactory> {
		return this.wrappers;
	}

	/**
	 * A new session binds its own extensions; the previous session's providers are gone
	 * with it, so the chain starts empty (F8c).
	 */
	clearAutocompleteProviders(): void {
		this.wrappers = [];
	}
}

/** pi's widget content as its text lines, or none when it is a component factory. */
const textLinesOf = (content: unknown): Option.Option<ReadonlyArray<string>> => {
	if (!Array.isArray(content)) return Option.none();
	const lines: string[] = [];
	for (const line of content) {
		if (typeof line !== "string") return Option.none();
		lines.push(line);
	}
	return Option.some(lines);
};

const answerSelection = (question: DialogQuestion, answer: DialogAnswer): string | undefined => {
	if (question.kind !== "select" || answer.kind !== "select") return undefined;
	return question.options[answer.index];
};

const asIs = (text: string): string => text;
/** `fg` and `bg` take the colour first, so their text is the second argument. */
const asIsColoured = (_colour: ThemeColor | ThemeBg, text: string): string => text;

/**
 * pi's `theme` singleton lives in a module its `exports` map does not expose, and
 * `new Theme(...)` throws without pi's token tables. An extension only uses a theme to
 * wrap text in terminal escapes, which the browser discards, so every member hands its
 * text back unchanged. Throwing would kill the handler that read it.
 */
const headlessTheme: Pick<Theme, keyof Theme> = {
	appearance: "dark",
	// SAFETY: `colors` is only handed back to a colour method, which ignores it here.
	colors: {} as Theme["colors"],
	style: asIs,
	fg: asIsColoured,
	bg: asIsColoured,
	bold: asIs,
	italic: asIs,
	underline: asIs,
	inverse: asIs,
	strikethrough: asIs,
	getFgAnsi: () => "",
	getBgAnsi: () => "",
	getColorMode: () => "truecolor",
	getThinkingBorderColor: () => asIs,
	getBashModeBorderColor: () => asIs,
};

// SAFETY: `Theme` keeps private fields, so only a real instance is assignable to it.
// Every public member above is a no-op that returns its text unchanged.
const theme = headlessTheme as Theme;

/** Map pi's `ExtensionUIContext` onto the browser's dialogs and notices. */
export const createUiContext = (host: UiHost): ExtensionUIContext => ({
	async select(title, options, opts) {
		const question: DialogQuestion = {
			id: crypto.randomUUID(),
			kind: "select",
			options,
			title,
		};
		const answer = await host.ask(question, questionOptions(opts));
		return answerSelection(question, answer);
	},
	async confirm(title, message, opts) {
		const answer = await host.ask(
			{ id: crypto.randomUUID(), kind: "confirm", message, title },
			questionOptions(opts),
		);
		return answer.kind === "confirm" && answer.confirmed;
	},
	async input(title, placeholder, opts) {
		const answer = await host.ask(
			{ id: crypto.randomUUID(), kind: "input", placeholder, title },
			questionOptions(opts),
		);
		return answer.kind === "input" ? answer.text : undefined;
	},
	// pi 1.4.0's `editor` takes no timeout or signal, so the question is asked without
	// either and the page's own Cancel closes it.
	async editor(title, prefill) {
		const question: DialogQuestion = { id: crypto.randomUUID(), kind: "editor", title };
		const answer = await host.ask(prefill === undefined ? question : { ...question, prefill });
		return answer.kind === "editor" ? answer.text : undefined;
	},
	notify(message, type) {
		host.notice(message, type === undefined || type === "info" ? "notice" : type);
	},
	setStatus(key, text) {
		host.setStatus(key, text);
	},
	setWidget(key: string, content: unknown, options?: ExtensionWidgetOptions) {
		// Undefined clears the keyed widget; a pi-tui component or a non-text line is refused.
		if (content === undefined) {
			host.setWidget(key, undefined, options?.placement);
			return;
		}
		const lines = textLinesOf(content);
		if (Option.isNone(lines)) {
			host.unsupported("setWidget");
			return;
		}
		host.setWidget(key, lines.value, options?.placement);
	},
	setTitle() {
		host.unsupported("setTitle");
	},
	setEditorText() {
		host.unsupported("setEditorText");
	},
	pasteToEditor() {
		host.unsupported("pasteToEditor");
	},
	onTerminalInput() {
		host.unsupported("onTerminalInput");
		return () => undefined;
	},
	setWorkingMessage() {
		host.unsupported("setWorkingMessage");
	},
	setWorkingVisible() {
		host.unsupported("setWorkingVisible");
	},
	setWorkingIndicator() {
		host.unsupported("setWorkingIndicator");
	},
	setHiddenThinkingLabel() {
		host.unsupported("setHiddenThinkingLabel");
	},
	setFooter() {
		host.unsupported("setFooter");
	},
	setHeader() {
		host.unsupported("setHeader");
	},
	custom<T>(): Promise<T> {
		host.unsupported("custom");
		// SAFETY: `custom` has no browser equivalent, and the extension's caller reads
		// the missing component as a cancellation.
		return Promise.resolve(undefined as T);
	},
	getEditorText() {
		return host.editorText();
	},
	addAutocompleteProvider(factory) {
		host.addAutocompleteProvider(factory);
	},
	setEditorComponent() {
		host.unsupported("setEditorComponent");
	},
	getEditorComponent() {
		return undefined;
	},
	get theme() {
		return theme;
	},
	getAllThemes() {
		return [];
	},
	getTheme() {
		return undefined;
	},
	setTheme() {
		return { error: "Theme switching needs the terminal tab", success: false };
	},
	getToolsExpanded() {
		return host.toolsExpanded();
	},
	setToolsExpanded(expanded) {
		host.setToolsExpanded(expanded);
	},
});
