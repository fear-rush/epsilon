/**
 * The embedded engine: one `AgentSession` per open session id, created in this
 * process instead of as a `pi --mode rpc` child
 * (docs/adr/0008-embed-pi-engine-with-opinions.md).
 *
 * Three things live here because they are engine wiring, not session state: the
 * resource loader that adds the CLI's built-in extensions, the
 * `ExtensionUIContext` bridge, and the JSON-event transform the reducer reads.
 */
import {
	createAgentSession,
	createCodemodeExtension,
	createMcpExtension,
	createToolSearchExtension,
	DefaultResourceLoader,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type {
	AgentSession,
	AgentSessionEvent,
	ExtensionUIContext,
	ExtensionWidgetOptions,
	InlineExtension,
	JsonAgentSessionEvent,
	Theme,
} from "@earendil-works/pi-coding-agent";
import type { DialogAnswer, DialogQuestion, ExtensionDisplay } from "shared";

import { discussExtension } from "./defaults/discuss";
import { permissionExtension } from "./defaults/permission";

/** What the engine needs from the session that owns the browser sockets. */
export type UiHost = {
	ask: (question: DialogQuestion, timeoutMs?: number) => Promise<DialogAnswer>;
	display: (request: ExtensionDisplay) => void;
	/** A method that needs pi's TUI. The host shows one notice per method. */
	unsupported: (method: string) => void;
	fail: (error: Error) => void;
};

/**
 * The CLI's own built-in extension set, registered the way the CLI registers it
 * (`dist/extensions/index.js`): `builtin` makes it a toggleable resource, and
 * `replaceable` lets an operator extension with the same command or tool name
 * take over. The SDK does not load these on its own (pi docs/sdk.md).
 */
const CLI_BUILTINS: InlineExtension[] = [
	{ name: "codemode", factory: createCodemodeExtension(), replaceable: true, builtin: true },
	{ name: "tool-search", factory: createToolSearchExtension(), replaceable: true, builtin: true },
	{ name: "mcp", factory: createMcpExtension(), replaceable: true, builtin: true },
];

/**
 * Epsilon's own defaults (ADR-0008 decision 3): code, not a file to copy, and
 * `replaceable` so an operator extension using the same command or tool name wins
 * by rule. `builtin` lets them be disabled by name from a terminal, which is also
 * the only place a deployment is configured (ADR-0006).
 */
const EPSILON_DEFAULTS: InlineExtension[] = [
	{ name: "permission", factory: permissionExtension, replaceable: true, builtin: true },
	{ name: "discuss", factory: discussExtension, replaceable: true, builtin: true },
];

/**
 * An existing session opens from its file. A fresh id, which the browser mints
 * for "New session", creates pi's session with that exact id; pi writes the file
 * on the first message.
 */
const openSessionManager = (cwd: string, sessionId: string): SessionManager => {
	const file = SessionManager.findById(cwd, sessionId);
	if (file !== undefined) return SessionManager.open(file, undefined, cwd);
	return SessionManager.create(cwd, undefined, { id: sessionId });
};

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

const answerValue = (answer: DialogAnswer): string | undefined =>
	"value" in answer && !("cancelled" in answer) ? answer.value : undefined;

const answerConfirmed = (answer: DialogAnswer): boolean =>
	"confirmed" in answer && !("cancelled" in answer) ? answer.confirmed : false;

/** Map pi's `ExtensionUIContext` onto the browser's dialogs and notices. */
const createUiContext = (host: UiHost): ExtensionUIContext => ({
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

/**
 * Start one engine. The caller has already decided which session id and home;
 * nothing here reads an inherited `PI_*` variable.
 */
export const createEngine = async (options: {
	sessionId: string;
	cwd: string;
	agentHome: string;
	ui: UiHost;
}): Promise<AgentSession> => {
	const settingsManager = SettingsManager.create(options.cwd, options.agentHome);
	const resourceLoader = new DefaultResourceLoader({
		cwd: options.cwd,
		agentDir: options.agentHome,
		settingsManager,
		extensionFactories: [...CLI_BUILTINS, ...EPSILON_DEFAULTS],
	});
	await resourceLoader.reload();
	const { session } = await createAgentSession({
		cwd: options.cwd,
		agentDir: options.agentHome,
		settingsManager,
		resourceLoader,
		sessionManager: openSessionManager(options.cwd, options.sessionId),
	});
	await session.bindExtensions({
		uiContext: createUiContext(options.ui),
		mode: "rpc",
		onError: (error) => {
			options.ui.fail(
				new Error(`extension ${error.extensionPath} failed in ${error.event}: ${error.error}`),
			);
		},
	});
	return session;
};

const toJsonDelta = (
	event: Extract<AgentSessionEvent, { type: "message_update" }>["assistantMessageEvent"],
): Extract<JsonAgentSessionEvent, { type: "message_update" }>["assistantMessageEvent"] => {
	if (event.type === "toolcall_start") {
		const toolCall = event.partial.content[event.contentIndex];
		if (toolCall?.type !== "toolCall") {
			throw new Error(`toolcall_start at index ${event.contentIndex} is not a tool call`);
		}
		const { partial: _partial, ...delta } = event;
		return { ...delta, id: toolCall.id, toolName: toolCall.name };
	}
	if (!("partial" in event)) return event;
	const { partial: _partial, ...delta } = event;
	return delta;
};

/**
 * pi's JSON event shape, which is what `shared/conversation/reduce.ts` reads.
 * pi ships this transform as a private module (`dist/modes/json-event.js`), not
 * as an export, so the host carries the same 20 lines. Re-verify on upgrade:
 * docs/notes/2026-10-28-tojson-is-not-exported.md.
 */
export const toJsonEvent = (event: AgentSessionEvent): JsonAgentSessionEvent => {
	if (event.type !== "message_update") return event;
	if (event.message.role !== "assistant") {
		throw new Error("message_update without an assistant message");
	}
	return {
		type: "message_update",
		usage: event.message.usage,
		assistantMessageEvent: toJsonDelta(event.assistantMessageEvent),
	};
};
