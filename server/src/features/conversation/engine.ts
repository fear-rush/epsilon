/**
 * The embedded engine's own wiring: the extensions every session loads and the
 * JSON-event transform the reducer reads. The runtime itself is built in
 * `host/` (docs/DECISIONS.md, Embedded engine); the `ExtensionUIContext` bridge
 * is `ui-context.ts`.
 */
import {
	createCodemodeExtension,
	createMcpExtension,
	createToolSearchExtension,
} from "@earendil-works/pi-coding-agent";
import type {
	AgentSession,
	AgentSessionEvent,
	InlineExtension,
	JsonAgentSessionEvent,
} from "@earendil-works/pi-coding-agent";

import { discussExtension } from "./extensions/discuss";
import { mcpObserverExtension } from "./extensions/mcp-observer";
import type { McpReportSink } from "./extensions/mcp-observer";
import { permissionExtension } from "./extensions/permission";

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
export const builtinExtensions = (onMcpReport?: McpReportSink): InlineExtension[] => [
	...CLI_BUILTINS,
	...EPSILON_DEFAULTS,
	// A copy or a test with no sink to report to needs no observer.
	...(onMcpReport === undefined ? [] : [mcpObserverExtension(onMcpReport)]),
];

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
