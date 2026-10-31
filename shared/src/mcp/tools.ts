/**
 * How pi picks the exposure of one tool, and the one write the tool switches
 * make. A rule is a tool name or a pattern where `*` matches any characters; an
 * exact name wins over a pattern, and among patterns the first row wins
 * (`getMcpToolExposure()` in pi). The switch reads and writes only exact names,
 * so it never rewrites a pattern the operator wrote.
 */
import type { McpExposure } from "./rules";
import { MCP_DEFAULT_EXPOSURE } from "./rules";

/** One `toolExposure` entry, in file order. */
export type ToolRule = { pattern: string; exposure: McpExposure };

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
 * The rules after switching one tool. Off writes the exact rule `hidden`. On drops
 * the exact rule, and when the server or a pattern would still hide the tool it
 * writes the exact rule `direct`, so the tool is the one thing the operator
 * exposed. Every other rule keeps its place.
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
