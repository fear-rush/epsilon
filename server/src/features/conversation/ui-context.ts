/**
 * pi's `ExtensionUIContext`, mapped onto the browser's dialogs and notices. Every
 * method that has a browser equivalent answers through `UiHost`; every method
 * that needs the terminal says so once instead of failing silently.
 *
 * `UiBridge` is what pi's context calls into: dialogs go to `Dialogs`; a method
 * that needs a terminal is reported once, and the ones an extension reaches
 * before the first tab attaches are held back and reported as one notice when it
 * arrives, because a session_start often touches several at once.
 */
import type {
	ExtensionUIContext,
	ExtensionWidgetOptions,
	Theme,
	ThemeBg,
	ThemeColor,
} from "@earendil-works/pi-coding-agent";
import type { DialogAnswer, DialogQuestion, ExtensionDisplay, ProtocolErrorCode } from "shared";

import type { AskOptions, Dialogs } from "./dialogs";

/** What the engine needs from the session that owns the browser sockets. */
export type UiHost = {
	ask: (question: DialogQuestion, options?: AskOptions) => Promise<DialogAnswer>;
	display: (request: ExtensionDisplay) => void;
	/** The draft the composer last reported, which an extension's `getEditorText` reads. */
	editorText: () => string;
	/** pi's session-wide tool-card expansion, which `getToolsExpanded` answers. */
	toolsExpanded: () => boolean;
	/** Record that expansion and draw it, so both tabs and pi agree on it. */
	setToolsExpanded: (expanded: boolean) => void;
	/** A method that needs pi's TUI. The host shows one notice per method. */
	unsupported: (method: string) => void;
	fail: (error: Error, code?: ProtocolErrorCode) => void;
};

export class UiBridge {
	private readonly early = new Set<string>();
	/** The composer's draft as the tab last reported it; empty until one attaches. */
	private editor = "";
	/** pi's session-wide tool-card expansion; pi's own default is collapsed. */
	private expanded = false;
	readonly host: UiHost;

	constructor(
		private readonly dialogs: Dialogs,
		private readonly hasSubscriber: () => boolean,
		fail: (error: Error, code?: ProtocolErrorCode) => void,
	) {
		this.host = {
			ask: dialogs.ask,
			display: dialogs.display,
			editorText: () => this.editor,
			toolsExpanded: () => this.expanded,
			setToolsExpanded: (expanded) => {
				this.expanded = expanded;
				this.dialogs.display({ method: "set_tools_expanded", expanded });
			},
			unsupported: (method) => {
				if (this.hasSubscriber()) this.dialogs.unsupported(method);
				else this.early.add(method);
			},
			fail,
		};
	}

	/** A tab reported its draft; this is what `getEditorText` answers from then on. */
	setEditorText(text: string): void {
		this.editor = text;
	}

	/** Called when a tab arrives: one notice for everything held back. */
	flush(): void {
		if (this.early.size === 0) return;
		this.dialogs.reportUnsupported(this.early);
		this.early.clear();
	}
}

const answerValue = (answer: DialogAnswer): string | undefined =>
	answer.method === "select" || answer.method === "input" || answer.method === "editor"
		? answer.value
		: undefined;

const answerConfirmed = (answer: DialogAnswer): boolean =>
	answer.method === "confirm" && answer.confirmed;

const asIs = (text: string): string => text;
/** `fg` and `bg` take the colour first, so their text is the second argument. */
const asIsColoured = (_colour: ThemeColor | ThemeBg, text: string): string => text;

/**
 * pi's `theme` singleton lives in an internal module the package's `exports` map
 * does not expose, and `new Theme(...)` throws without pi's own token tables. An
 * extension only uses a theme to wrap text in ANSI escapes for a terminal, and
 * the browser discards those, so every member hands its text back unchanged.
 * Throwing instead would kill the handler that read it, and pi counts a failed
 * `tool_call` handler as blocking the tool.
 */
const headlessTheme: Pick<Theme, keyof Theme> = {
	appearance: "dark",
	// SAFETY: `colors` is only read to hand a token back to a colour method, which
	// ignores it here. An empty record is the honest answer: this theme has none.
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

// SAFETY: `Theme` keeps private fields, so only a real instance is assignable to
// it. Every public member above is a no-op that returns its text unchanged.
const theme = headlessTheme as Theme;

/** Map pi's `ExtensionUIContext` onto the browser's dialogs and notices. */
export const createUiContext = (host: UiHost): ExtensionUIContext => ({
	async select(title, options, opts) {
		const answer = await host.ask(
			{ id: crypto.randomUUID(), method: "select", title, options },
			{ timeoutMs: opts?.timeout, signal: opts?.signal },
		);
		return answerValue(answer);
	},
	async confirm(title, message, opts) {
		const answer = await host.ask(
			{ id: crypto.randomUUID(), method: "confirm", title, message },
			{ timeoutMs: opts?.timeout, signal: opts?.signal },
		);
		return answerConfirmed(answer);
	},
	async input(title, placeholder, opts) {
		const answer = await host.ask(
			{ id: crypto.randomUUID(), method: "input", title, placeholder },
			{ timeoutMs: opts?.timeout, signal: opts?.signal },
		);
		return answerValue(answer);
	},
	// pi 1.4.0's `editor` takes no `ExtensionUIDialogOptions`, so an extension cannot
	// time it out or withdraw it; the dialog waits for a person.
	async editor(title, prefill) {
		const answer = await host.ask({ id: crypto.randomUUID(), method: "editor", title, prefill });
		return answerValue(answer);
	},
	notify(message, type) {
		host.display({ method: "notify", message, notifyType: type });
	},
	setStatus(key, text) {
		host.display({ method: "setStatus", statusKey: key, statusText: text });
	},
	setWidget(key, content, options: ExtensionWidgetOptions | undefined) {
		// Undefined clears the keyed widget; only a component factory is unsupported.
		if (content !== undefined && !Array.isArray(content)) {
			host.unsupported("setWidget");
			return;
		}
		host.display({
			method: "setWidget",
			widgetKey: key,
			widgetLines: content,
			widgetPlacement: options?.placement,
		});
	},
	setTitle(title) {
		host.display({ method: "setTitle", title });
	},
	setEditorText(text) {
		host.display({ method: "set_editor_text", text, mode: "replace" });
	},
	// pi's paste inserts into the editor at the cursor; a browser has no cursor here,
	// so it appends to the draft, which is where the caret already is.
	pasteToEditor(text) {
		host.display({ method: "set_editor_text", text, mode: "append" });
	},
	// The rest of the terminal surface: raw key input, and pi-tui components the
	// browser cannot render. Each one says so once instead of failing silently.
	onTerminalInput() {
		host.unsupported("onTerminalInput");
		return () => undefined;
	},
	setWorkingMessage(message) {
		host.display({ method: "set_working_message", message });
	},
	setWorkingVisible(visible) {
		host.display({ method: "set_working_visible", visible });
	},
	// The browser draws one spinner, not an animation the extension composed, so its
	// frames and interval have nowhere to go.
	setWorkingIndicator() {
		host.unsupported("setWorkingIndicator");
	},
	setHiddenThinkingLabel(label) {
		host.display({ method: "set_hidden_thinking_label", label });
	},
	setFooter() {
		host.unsupported("setFooter");
	},
	setHeader() {
		host.unsupported("setHeader");
	},
	async custom<T>(): Promise<T> {
		host.unsupported("custom");
		// SAFETY: `custom` has no browser equivalent. The host reports it, and the
		// extension's caller reads the missing component as a cancellation.
		return undefined as T;
	},
	getEditorText() {
		return host.editorText();
	},
	addAutocompleteProvider() {
		host.unsupported("addAutocompleteProvider");
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
		return { success: false, error: "Theme switching needs the terminal tab" };
	},
	getToolsExpanded() {
		return host.toolsExpanded();
	},
	setToolsExpanded(expanded) {
		host.setToolsExpanded(expanded);
	},
});
