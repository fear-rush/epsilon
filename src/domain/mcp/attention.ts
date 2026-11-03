import type { McpAttention } from "#protocol/config/mcp";

/**
 * What pi reports about MCP servers it could not use.
 *
 * The SDK exposes no connection state, so the one answer a host can read is the notice
 * pi's MCP extension pushes once the connections have settled and after a reconnect:
 *
 * ```
 * MCP servers need attention:
 *   files: needs sign-in
 *   docs: failed: connect ECONNREFUSED
 * Run /mcp to fix.
 * ```
 *
 * `reportProblems()` in pi's MCP extension builds it: a `config:` line for a file pi
 * could not read, and otherwise one line per server that is `needs-auth` or `failed`. A
 * line in any other shape is ignored rather than guessed at, and the operator still sees
 * pi's whole notice in the chat.
 */

/** The opening line that marks the notice, so an ordinary notice is never read as state. */
const ATTENTION_NOTICE = "MCP servers need attention:";

/** A server name may hold letters, digits, `_` and `-`, so the first `: ` ends it. */
const SERVER_LINE = /^([A-Za-z0-9_-]+): (.+)$/;

/** The states pi reports in that notice, with the words its own `describeState()` uses. */
const NEEDS_SIGN_IN = "needs sign-in";
const FAILED = "failed: ";

/**
 * The servers one notice named, or `undefined` when the notice is not pi's attention
 * report. The whole notice replaces the previous answer: pi lists every server that needs
 * attention, so a server missing here is one pi stopped complaining about.
 */
export const readMcpAttention = (notice: string): ReadonlyMap<string, McpAttention> | undefined => {
	if (!notice.startsWith(ATTENTION_NOTICE)) return undefined;
	const servers = new Map<string, McpAttention>();
	for (const raw of notice.slice(ATTENTION_NOTICE.length).split("\n")) {
		const line = SERVER_LINE.exec(raw.trim());
		if (line === null) continue;
		const name = line[1] ?? "";
		const state = line[2] ?? "";
		if (state === NEEDS_SIGN_IN) servers.set(name, { kind: "needs-sign-in" });
		else if (state.startsWith(FAILED)) {
			servers.set(name, { kind: "failed", message: state.slice(FAILED.length) });
		}
	}
	return servers;
};
