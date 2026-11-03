import { mcpNamespaceOf } from "./rules.ts";

/**
 * How pi names an MCP tool, and the `toolExposure` key that reaches it.
 *
 * pi matches a rule against the name the server reported, which `getAllTools()` never
 * shows: it reports the registered name, with every character outside `[A-Za-z0-9_]`
 * replaced and a long name shortened. A rule key is therefore the server's own spelling
 * only when the registered name carries no `_`; otherwise the unknown character may have
 * been `-`, `.` or a space, and Epsilon writes `*` for it.
 */

/**
 * pi's three resource tools. They are registered once for the session, with no server
 * namespace, when at least one enabled server offers resources, so they name resources
 * without naming a server.
 */
export const MCP_RESOURCE_TOOL_NAMES = [
	"list_mcp_resources",
	"list_mcp_resource_templates",
	"read_mcp_resource",
] as const;

/** pi's provider tool-name limit: a longer registered name carries a hash suffix. */
const MCP_TOOL_NAME_LIMIT = 64;

/** The hash pi appends to a shortened name: `_` and eight hex characters. */
const MCP_TOOL_HASH_LENGTH = 9;

const MCP_TOOL_HASH = /_[0-9a-f]{8}$/;

/** One live tool of an MCP server: how the page names it, and the rule that reaches it. */
export type McpToolAddress = {
	/** The registered name without its `mcp__<server>__` prefix, as a transcript shows it. */
	readonly name: string;
	/** The `toolExposure` key pi matches this tool against. */
	readonly key: string;
	/** Whether `key` is the server's own name, or a pattern that also matches other names. */
	readonly exact: boolean;
};

/** The name a server offered a tool under, recovered from the name pi registered it as. */
export function mcpToolAddress(server: string, registered: string): McpToolAddress {
	const prefix = `${mcpNamespaceOf(server)}__`;
	const name = registered.startsWith(prefix) ? registered.slice(prefix.length) : registered;
	const shortened = registered.length === MCP_TOOL_NAME_LIMIT && MCP_TOOL_HASH.test(registered);
	if (!shortened && !name.includes("_")) return { exact: true, key: name, name };
	// A shortened name hides the end of the server's own name, so the pattern stops there.
	const head = shortened ? name.slice(0, -MCP_TOOL_HASH_LENGTH) : name;
	const key = `${head.replaceAll("_", "*")}${shortened ? "*" : ""}`;
	return { exact: false, key, name };
}
