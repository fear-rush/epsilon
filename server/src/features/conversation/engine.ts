/**
 * The embedded engine: one `AgentSession` per open session id, created in this
 * process through pi's SDK (docs/adr/0008-embed-pi-engine-with-opinions.md).
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
import { createUiContext } from "./ui-context";
import type { AgentHome } from "../../platform/agent-home";
import type { UiHost } from "./ui-bridge";

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
 * by rule. `builtin` lets them be disabled by name.
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

/**
 * Start one engine. The caller has already decided which session id and home;
 * nothing here reads an inherited `PI_*` variable.
 */
export const createEngine = async (options: {
	sessionId: string;
	cwd: string;
	home: AgentHome;
	ui: UiHost;
}): Promise<AgentSession> => {
	const settingsManager = SettingsManager.create(options.cwd, options.home.dir);
	const resourceLoader = new DefaultResourceLoader({
		cwd: options.cwd,
		agentDir: options.home.dir,
		settingsManager,
		extensionFactories: [...CLI_BUILTINS, ...EPSILON_DEFAULTS],
	});
	await resourceLoader.reload();
	const { session } = await createAgentSession({
		cwd: options.cwd,
		agentDir: options.home.dir,
		settingsManager,
		resourceLoader,
		sessionManager: openSessionManager(options.cwd, options.sessionId),
	});
	await session.bindExtensions({
		uiContext: createUiContext(options.ui),
		// "json" is pi's name for a headless host that reads events, which is what
		// this server is. Extensions guard terminal-only UI with `mode === "tui"`.
		mode: "json",
		onError: (error) => {
			options.ui.fail(
				new Error(`extension ${error.extensionPath} failed in ${error.event}: ${error.error}`),
				"EXTENSION_ERROR",
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
