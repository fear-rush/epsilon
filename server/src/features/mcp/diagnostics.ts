/**
 * What a server's connection left behind, read without ever touching a token:
 * the log lines pi appended for one server, and whether `mcp-auth.json` holds a
 * sign-in for it. pi exposes neither through the SDK, so these are the two files
 * it documents (docs/pi-sdk.md, Files in the agent home).
 *
 * Both reads are bounded and tolerant: a missing, oversized or unparsable file
 * means "nothing to show", never a failed settings page.
 */
import { open, readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { mcpNamespaceOf } from "shared";

import type { AgentHome } from "../../platform/agent-home";

/** The tail of the log a detail pane shows; pi rotates the file at 5 MB. */
const LOG_BYTES = 64 * 1024;

/** The most lines one server's detail carries, so a chatty server cannot fill the page. */
const MAX_LINES = 40;

/** `mcp-auth.json` maps a credential key to its tokens; only the keys are ever read. */
const credentialKeysSchema = z.record(z.string(), z.json());

/**
 * The last lines of one log file that name `server`. A line is
 * `<time> [<server>] ...`, so the name in brackets is what selects them.
 */
const tailOf = async (path: string, server: string): Promise<string[]> => {
	const info = await stat(path).catch(() => undefined);
	if (info === undefined || !info.isFile()) return [];
	const length = Math.min(info.size, LOG_BYTES);
	if (length === 0) return [];
	const handle = await open(path, "r").catch(() => undefined);
	if (handle === undefined) return [];
	try {
		const buffer = Buffer.alloc(length);
		const { bytesRead } = await handle.read(buffer, 0, length, info.size - length);
		const marker = `[${server}]`;
		return buffer
			.subarray(0, bytesRead)
			.toString("utf8")
			.split("\n")
			.map((line) => line.trimEnd())
			.filter((line) => line.includes(marker))
			.slice(-MAX_LINES);
	} catch {
		return [];
	} finally {
		await handle.close();
	}
};

/**
 * What pi logged for one server. pi rotates the file at 5 MB, so a server that
 * spoke only before the rotation is read from the previous file instead of being
 * reported as silent.
 */
export const mcpLogTail = async (home: AgentHome, server: string): Promise<string[]> => {
	const current = await tailOf(home.mcpLogFile, server);
	return current.length > 0 ? current : tailOf(home.mcpLogRotatedFile, server);
};

/**
 * Whether `<home>/mcp-auth.json` holds a credential for this server. pi keys a
 * credential by `<namespace>|<url>`, and older versions by the URL alone, so both
 * are checked. The token itself is never read past its key.
 */
export const hasMcpCredentials = async (
	home: AgentHome,
	server: string,
	url: string | undefined,
): Promise<boolean> => {
	const info = await stat(home.mcpAuthFile).catch(() => undefined);
	if (info === undefined || !info.isFile() || info.size > 1_000_000) return false;
	let decoded: unknown;
	try {
		decoded = JSON.parse(await readFile(home.mcpAuthFile, "utf8"));
	} catch {
		return false;
	}
	const parsed = credentialKeysSchema.safeParse(decoded);
	if (!parsed.success) return false;
	const prefix = `${mcpNamespaceOf(server)}|`;
	const legacy = url !== undefined && URL.canParse(url) ? String(new URL(url)) : undefined;
	return Object.keys(parsed.data).some(
		(key) => key.startsWith(prefix) || (legacy !== undefined && key === legacy),
	);
};
