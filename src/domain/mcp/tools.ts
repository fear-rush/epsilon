import type { McpExposure } from "#protocol/settings/mcp";

import { MCP_DEFAULT_EXPOSURE, mcpNamespaceOf } from "./rules.ts";

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

/** One `toolExposure` entry, in file order. */
export type ToolRule = { readonly pattern: string; readonly exposure: McpExposure };

const escapeRegExp = (text: string): string => text.replaceAll(/[.+?^${}()|[\]\\]/g, "\\$&");

/** pi's pattern: every character literal except `*`, anchored at both ends. */
export const toolPatternMatches = (pattern: string, tool: string): boolean =>
	new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`).test(tool);

/** The exposure pi gives `tool`: its exact rule, else the first matching pattern, else the server's. */
export function effectiveToolExposure(
	server: McpExposure | undefined,
	rules: ReadonlyArray<ToolRule>,
	tool: string,
): McpExposure {
	const exact = rules.find((rule) => rule.pattern === tool);
	if (exact !== undefined) return exact.exposure;
	const pattern = rules.find(
		(rule) => rule.pattern.includes("*") && toolPatternMatches(rule.pattern, tool),
	);
	return pattern?.exposure ?? server ?? MCP_DEFAULT_EXPOSURE;
}

/** Whether the model can reach the tool at all: anything but `hidden`. */
export const isToolReachable = (
	server: McpExposure | undefined,
	rules: ReadonlyArray<ToolRule>,
	tool: string,
): boolean => effectiveToolExposure(server, rules, tool) !== "hidden";

/**
 * The rules after switching one tool. Off writes `hidden`. On drops it, and when the
 * server or a pattern would still hide the tool it writes `direct`, so the tool is the
 * one thing the operator exposed. Every other rule keeps its place.
 */
export function withToolReachable(
	server: McpExposure | undefined,
	rules: ReadonlyArray<ToolRule>,
	tool: string,
	reachable: boolean,
): ToolRule[] {
	const others = rules.filter((rule) => rule.pattern !== tool);
	if (!reachable) return [...others, { exposure: "hidden", pattern: tool }];
	return isToolReachable(server, others, tool)
		? others
		: [...others, { exposure: "direct", pattern: tool }];
}
