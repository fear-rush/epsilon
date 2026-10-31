/**
 * The embedded engine: one `AgentSession` per open session id, created in this
 * process through pi's SDK (docs/DECISIONS.md, Embedded engine).
 *
 * Two things live here because they are engine wiring, not session state: the
 * resource loader that adds the CLI's built-in extensions, and the JSON-event
 * transform the reducer reads. The `ExtensionUIContext` bridge is
 * `ui-context.ts`.
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
	InlineExtension,
	JsonAgentSessionEvent,
} from "@earendil-works/pi-coding-agent";

import { discussExtension } from "./extensions/discuss";
import { permissionExtension } from "./extensions/permission";
import type { AgentHome } from "../../platform/agent-home";
import { createUiContext } from "./ui-context";
import type { UiHost } from "./ui-context";

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
 * Epsilon's own defaults (docs/DECISIONS.md, Default extensions): code, not a file to copy, and
 * `replaceable` so an operator extension using the same command or tool name wins
 * by rule. `builtin` lets them be disabled by name.
 */
const EPSILON_DEFAULTS: InlineExtension[] = [
	{ name: "permission", factory: permissionExtension, replaceable: true, builtin: true },
	{ name: "discuss", factory: discussExtension, replaceable: true, builtin: true },
];

/**
 * The extensions every engine in this process loads: the CLI's built-ins and
 * Epsilon's defaults, so a copy's transient runtime sees the same set
 * (docs/DECISIONS.md, Default extensions).
 */
export const builtinExtensions = (): InlineExtension[] => [...CLI_BUILTINS, ...EPSILON_DEFAULTS];

/**
 * Bind pi's extensions to a session: the browser's dialogs, `"json"` for a headless
 * host, and extension failures reported where the caller shows errors. pi's runtime
 * rebinds a replaced session with the same call, because the subscriptions and the
 * extension context belong to the session that was replaced.
 */
export const bindEngine = (agent: AgentSession, ui: UiHost): Promise<void> =>
	agent.bindExtensions({
		uiContext: createUiContext(ui),
		// "json" is pi's name for a headless host that reads events, which is what
		// this server is. Extensions guard terminal-only UI with `mode === "tui"`.
		mode: "json",
		onError: (error) => {
			ui.fail(
				new Error(`extension ${error.extensionPath} failed in ${error.event}: ${error.error}`),
				"EXTENSION_ERROR",
			);
		},
	});

/**
 * An existing session opens from the file the registry located. A fresh id, which
 * the browser mints for "New chat", creates pi's session with that exact id; pi
 * writes the file on the first message.
 */
const openSessionManager = (
	cwd: string,
	sessionId: string,
	file: string | undefined,
): SessionManager =>
	file === undefined
		? SessionManager.create(cwd, undefined, { id: sessionId })
		: SessionManager.open(file, undefined, cwd);

/**
 * The built-in tools that run commands or change files: what the composer's tool
 * switch turns on and off. Turning them on adds pi's own defaults; `read` and the
 * search tools stay either way, because a skill is loaded by reading its file.
 */
const CODING_TOOLS = new Set(["bash", "powershell", "edit", "write"]);
const CODING_DEFAULTS = ["bash", "edit", "write"];

export const hasCodingTools = (agent: AgentSession): boolean =>
	agent.getActiveToolNames().some((name) => CODING_TOOLS.has(name));

/**
 * pi records the active tool set in the transcript on the next run and restores
 * it when the session opens again, so the switch needs no file of its own.
 */
export const setCodingTools = (agent: AgentSession, enabled: boolean): void => {
	const kept = agent.getActiveToolNames().filter((name) => !CODING_TOOLS.has(name));
	agent.setActiveToolsByName(enabled ? [...kept, ...CODING_DEFAULTS] : kept);
};

/**
 * Start one engine. The caller has already decided which session, folder and
 * home; nothing here reads an inherited `PI_*` variable. A new chat starts with
 * the coding tools off; every other session keeps what pi restored.
 */
export const createEngine = async (options: {
	sessionId: string;
	cwd: string;
	/** The session file, or undefined for a session that has none yet. */
	file: string | undefined;
	chat: boolean;
	home: AgentHome;
	ui: UiHost;
}): Promise<AgentSession> => {
	const settingsManager = SettingsManager.create(options.cwd, options.home.dir);
	const resourceLoader = new DefaultResourceLoader({
		cwd: options.cwd,
		agentDir: options.home.dir,
		settingsManager,
		extensionFactories: builtinExtensions(),
	});
	await resourceLoader.reload();
	const { session } = await createAgentSession({
		cwd: options.cwd,
		agentDir: options.home.dir,
		settingsManager,
		resourceLoader,
		sessionManager: openSessionManager(options.cwd, options.sessionId, options.file),
	});
	// Only the project's folder is trusted, and only because the registry checked
	// pi's trust store before building this engine. A chat's folder holds no `.pi`.
	settingsManager.setProjectTrusted(!options.chat);
	await bindEngine(session, options.ui);
	if (options.chat && options.file === undefined) setCodingTools(session, false);
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
 * docs/pi-sdk.md, Traps.
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
