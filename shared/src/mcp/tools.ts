/**
 * How pi picks the exposure of one tool, and the one write the tool switches
 * make. A rule is a tool name or a pattern where `*` matches any characters; an
 * exact name wins over a pattern, and among patterns the first row wins
 * (`getMcpToolExposure()` in pi). pi matches a rule against the name the server
 * reports, which `getAllTools()` never shows, so `mcpToolAddress()` recovers that
 * name from the one pi registered and turns it into the key a switch writes.
 */
import type { McpExposure } from "./rules";
import { MCP_DEFAULT_EXPOSURE, mcpNamespaceOf } from "./rules";

/** One `toolExposure` entry, in file order. */
export type ToolRule = { pattern: string; exposure: McpExposure };

/** pi's provider tool-name limit: a longer registered name carries a hash suffix. */
const MCP_TOOL_NAME_LIMIT = 64;

/** The hash pi appends to a shortened name: `_` and eight hex characters. */
const MCP_TOOL_HASH_LENGTH = 9;

const MCP_TOOL_HASH = /_[0-9a-f]{8}$/;

/** One live tool of an MCP server: how the panel names it, and the rule that reaches it. */
export type McpToolAddress = {
	/** The registered name without its `mcp__<server>__` prefix, as a transcript shows it. */
	name: string;
	/** The `toolExposure` key pi matches this tool against. */
	key: string;
	/** Whether `key` is the server's own name, or a pattern that also matches other names. */
	exact: boolean;
};

/**
 * The name a server offered a tool under, recovered from the name pi registered
 * it as. pi rewrites everything but letters, digits and `_` to `_` and shortens a
 * long name to 55 characters plus a hash, so the registered spelling is the
 * server's own only when it carries no `_`. Otherwise the unknown character may
 * have been `-`, `.` or a space, and `*` matches whichever it was: the key is then
 * a pattern pi resolves instead of an exact name.
 */
export function mcpToolAddress(server: string, registered: string): McpToolAddress {
	const prefix = `${mcpNamespaceOf(server)}__`;
	const name = registered.startsWith(prefix) ? registered.slice(prefix.length) : registered;
	const shortened = registered.length === MCP_TOOL_NAME_LIMIT && MCP_TOOL_HASH.test(registered);
	if (!shortened && !name.includes("_")) return { name, key: name, exact: true };
	// A shortened name hides the end of the server's own name, so the pattern stops there.
	const head = shortened ? name.slice(0, -MCP_TOOL_HASH_LENGTH) : name;
	const key = `${head.split("_").join("*")}${shortened ? "*" : ""}`;
	return { name, key, exact: false };
}

const escapeRegExp = (text: string): string => text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

/** pi's pattern: every character literal except `*`, anchored at both ends. */
export const toolPatternMatches = (pattern: string, tool: string): boolean =>
	new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`).test(tool);

/** The exposure pi gives `tool`: its exact rule, else the first matching pattern, else the server's. */
export function effectiveToolExposure(
	server: McpExposure | undefined,
	rules: readonly ToolRule[],
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
	rules: readonly ToolRule[],
	tool: string,
): boolean => effectiveToolExposure(server, rules, tool) !== "hidden";

/**
 * The rules after switching one tool. Off writes the rule `hidden`. On drops it,
 * and when the server or a pattern would still hide the tool it writes the rule
 * `direct`, so the tool is the one thing the operator exposed. `tool` is the key
 * of `mcpToolAddress()`: an exact name, or a pattern that matches the server's own
 * name. A hand-written pattern reached pi by the server's name and here by the
 * key, so the two can disagree when one pattern's spelling is the other's name.
 * Every other rule keeps its place.
 */
export function withToolReachable(
	server: McpExposure | undefined,
	rules: readonly ToolRule[],
	tool: string,
	reachable: boolean,
): ToolRule[] {
	const others = rules.filter((rule) => rule.pattern !== tool);
	if (!reachable) return [...others, { pattern: tool, exposure: "hidden" }];
	return isToolReachable(server, others, tool)
		? others
		: [...others, { pattern: tool, exposure: "direct" }];
}
