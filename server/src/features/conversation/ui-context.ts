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
} from "@earendil-works/pi-coding-agent";
import type { DialogAnswer, DialogQuestion, ExtensionDisplay, ProtocolErrorCode } from "shared";

import type { Dialogs } from "./dialogs";

/** What the engine needs from the session that owns the browser sockets. */
export type UiHost = {
	ask: (question: DialogQuestion, timeoutMs?: number) => Promise<DialogAnswer>;
	display: (request: ExtensionDisplay) => void;
	/** A method that needs pi's TUI. The host shows one notice per method. */
	unsupported: (method: string) => void;
	fail: (error: Error, code?: ProtocolErrorCode) => void;
};

export class UiBridge {
	private readonly early = new Set<string>();
	readonly host: UiHost;

	constructor(
		private readonly dialogs: Dialogs,
		private readonly hasSubscriber: () => boolean,
		fail: (error: Error, code?: ProtocolErrorCode) => void,
	) {
		this.host = {
			ask: dialogs.ask,
			display: dialogs.display,
			unsupported: (method) => {
				if (this.hasSubscriber()) this.dialogs.unsupported(method);
				else this.early.add(method);
			},
			fail,
		};
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

// SAFETY: a Theme has no headless value. Every property read throws before the
// proxy can serve one, so no caller ever gets a working Theme member.
const unsupportedTheme = new Proxy(
	{},
	{
		get(): never {
			throw new Error("epsilon has no terminal theme; the browser renders instead");
		},
	},
) as Theme;

/** Map pi's `ExtensionUIContext` onto the browser's dialogs and notices. */
export const createUiContext = (host: UiHost): ExtensionUIContext => ({
	async select(title, options, opts) {
		const answer = await host.ask(
			{ id: crypto.randomUUID(), method: "select", title, options },
			opts?.timeout,
		);
		return answerValue(answer);
	},
	async confirm(title, message, opts) {
		const answer = await host.ask(
			{ id: crypto.randomUUID(), method: "confirm", title, message },
			opts?.timeout,
		);
		return answerConfirmed(answer);
	},
	async input(title, placeholder, opts) {
		const answer = await host.ask(
			{ id: crypto.randomUUID(), method: "input", title, placeholder },
			opts?.timeout,
		);
		return answerValue(answer);
	},
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
		host.display({ method: "set_editor_text", text });
	},
	pasteToEditor(text) {
		host.display({ method: "set_editor_text", text });
	},
	// Nothing in the server can read or write a composer, answer terminal input
	// or render a TUI component. Each one says so once instead of failing silently.
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
	async custom<T>(): Promise<T> {
		host.unsupported("custom");
		// SAFETY: `custom` has no browser equivalent. The host reports it, and the
		// extension's caller reads the missing component as a cancellation.
		return undefined as T;
	},
	getEditorText() {
		return "";
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
		host.unsupported("theme");
		return unsupportedTheme;
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
		return false;
	},
	setToolsExpanded() {
		host.unsupported("setToolsExpanded");
	},
});
