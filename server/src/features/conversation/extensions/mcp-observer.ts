/**
 * What pi lets an extension see of MCP. `getMcpServers()` reports the servers other
 * extensions registered — config and owning extension, never connection state — and
 * `getAllTools()` reports the tools that reached this session, annotations included.
 * pi keeps its six connection states (`connecting`, `connected`, `disconnected`,
 * `needs-auth`, `failed`, `closed`) inside its own MCP extension, so this reports
 * only what it can prove: which servers were registered, even the ones that
 * connected nothing. The host merges that with its tool inventory and with what it
 * reads from `mcp.log` and `mcp-auth.json` (docs/pi-sdk.md, MCP).
 */
import type {
	ExtensionAPI,
	InlineExtension,
	RegisteredMcpServer,
} from "@earendil-works/pi-coding-agent";

export type McpObserverReport = {
	/**
	 * Every server registered with `pi.registerMcpServer()`, in registration order.
	 * The name is all the panel needs: pi also reports the owning extension, but
	 * nothing draws it yet, and a field no one reads is worse than one to add later.
	 */
	registered: string[];
};

/** Where a report goes: the owning session, which keeps the last one it received. */
export type McpReportSink = (report: McpObserverReport) => void;

/** The event's list is the current one; `getMcpServers()` answers the same thing. */
const namesOf = (servers: readonly RegisteredMcpServer[]): string[] =>
	servers.map((server) => server.name);

/**
 * Report registrations on `session_start` and whenever they change. `builtin` makes
 * it a toggleable resource and `replaceable` lets an operator extension that handles
 * `mcp_servers_change` itself take over, the rule the other defaults follow.
 */
export const mcpObserverExtension = (report: McpReportSink): InlineExtension => ({
	name: "mcp-observer",
	builtin: true,
	replaceable: true,
	factory: (pi: ExtensionAPI) => {
		pi.on("session_start", () => {
			report({ registered: namesOf(pi.getMcpServers()) });
		});
		pi.on("mcp_servers_change", (event) => {
			report({ registered: namesOf(event.servers) });
		});
	},
});
