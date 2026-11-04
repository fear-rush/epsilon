import {
	createCodemodeExtension,
	createMcpExtension,
	createToolSearchExtension,
} from "@earendil-works/pi-coding-agent";
import type {
	ExtensionAPI,
	InlineExtension,
	RegisteredMcpServer,
} from "@earendil-works/pi-coding-agent";

import { discussExtension } from "./discuss.ts";

/**
 * The CLI's built-in extensions, registered the way the CLI registers them
 * (`dist/extensions/index.js`): `builtin` makes each a toggleable resource, and
 * `replaceable` lets an operator extension with the same command or tool name take over.
 *
 * The SDK does not load these on its own, so an engine without them is quieter than
 * `pi` in a terminal: no codemode, no deferred `tool_search`, and no MCP servers at all.
 * Epsilon's own `discuss` tool is registered here too, so a chat can ask a question the
 * page answers; the permission guard lands with the feature that needs it.
 */

/** Where an MCP registration report goes: the runtime that owns this session. */
type McpReportSink = (names: ReadonlyArray<string>) => void;

/** The event's list is the current one; `getMcpServers()` answers the same thing. */
const namesOf = (servers: ReadonlyArray<RegisteredMcpServer>): ReadonlyArray<string> =>
	servers.map((server) => server.name);

/**
 * What pi lets an extension see of MCP: the servers other extensions registered, which
 * is never their connection state. pi keeps its six connection states inside its own MCP
 * extension, so the live panel merges this with the tools that reached the session and
 * with the attention notice.
 *
 * Handling `mcp_servers_change` makes pi treat this extension as the one that connects
 * registered servers, so it stops warning that none does. In every configuration with
 * pi's own MCP extension loaded nothing changes; where MCP support was replaced, the
 * panel still names the server as registered with no tools.
 */
export const mcpObserverExtension = (report: McpReportSink): InlineExtension => ({
	name: "mcp-observer",
	builtin: true,
	replaceable: true,
	factory: (pi: ExtensionAPI) => {
		pi.on("session_start", () => {
			report(namesOf(pi.getMcpServers()));
		});
		pi.on("mcp_servers_change", (event) => {
			report(namesOf(event.servers));
		});
	},
});

export const builtinExtensions = (report: McpReportSink): InlineExtension[] => [
	{ name: "codemode", factory: createCodemodeExtension(), replaceable: true, builtin: true },
	{ name: "tool-search", factory: createToolSearchExtension(), replaceable: true, builtin: true },
	{ name: "mcp", factory: createMcpExtension(), replaceable: true, builtin: true },
	{ name: "discuss", factory: discussExtension, replaceable: true, builtin: true },
	mcpObserverExtension(report),
];
