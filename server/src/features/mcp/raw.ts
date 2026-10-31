/**
 * One server's `mcp.json` entry as JSON text, for the Raw tab. The browser never
 * receives a stored secret: every value the detail route hides is replaced by
 * `STORED` on the way out, and each `STORED` that comes back is replaced by the
 * value the file holds at the same path. Only that one key of the file is written.
 */
import type { McpScope } from "shared";

import type { AgentHome } from "../../platform/agent-home";
import { isRecord, projectEntryProblem, readMcpEntry } from "./domain";
import type { McpRawEntry } from "./domain";
import { mcpDocument } from "./store";

/** What stands in for a stored value in the text the browser sees. */
const STORED = "<stored>";

/** The `oauth` keys the detail route shows; every other one is hidden like the secret. */
const SHOWN_OAUTH_KEYS = new Set([
	"clientId",
	"callbackPort",
	"callbackUrl",
	"scope",
	"clientName",
	"clientRegistration",
	"authServerMetadataUrl",
]);

/** Every value of a map replaced by the sentinel; a value that is not a map is left. */
const hideValues = (value: McpRawEntry | undefined): McpRawEntry | undefined =>
	value !== undefined && isRecord(value)
		? Object.fromEntries(Object.keys(value).map((key) => [key, STORED]))
		: value;

const hideOAuth = (value: McpRawEntry | undefined): McpRawEntry | undefined =>
	value !== undefined && isRecord(value)
		? Object.fromEntries(
				Object.entries(value).map(([key, entry]) => [
					key,
					SHOWN_OAUTH_KEYS.has(key) ? entry : STORED,
				]),
			)
		: value;

/** The entry with `env`, `headers` and `oauth` secrets hidden. */
const redactEntry = (entry: McpRawEntry): McpRawEntry => {
	if (!isRecord(entry)) return entry;
	const next = { ...entry };
	if (next.env !== undefined) next.env = hideValues(next.env) ?? null;
	if (next.headers !== undefined) next.headers = hideValues(next.headers) ?? null;
	if (next.oauth !== undefined) next.oauth = hideOAuth(next.oauth) ?? null;
	return next;
};

/** Put the stored value back wherever `incoming` holds the sentinel; the path is the same in both. */
const restoreStored = (
	incoming: McpRawEntry,
	stored: McpRawEntry | undefined,
	path: string[] = [],
): McpRawEntry => {
	if (incoming === STORED) {
		if (stored === undefined) {
			throw new Error(`"${path.join(".")}" has no stored value to keep; type a value.`);
		}
		return stored;
	}
	if (Array.isArray(incoming)) {
		return incoming.map((item, index) =>
			restoreStored(item, Array.isArray(stored) ? stored[index] : undefined, [
				...path,
				String(index),
			]),
		);
	}
	if (incoming !== null && isRecord(incoming)) {
		const storedMap = stored !== undefined && isRecord(stored) ? stored : {};
		return Object.fromEntries(
			Object.entries(incoming).map(([key, value]) => [
				key,
				restoreStored(value, storedMap[key], [...path, key]),
			]),
		);
	}
	return incoming;
};

export async function readMcpRaw(
	home: AgentHome,
	projectDir: string,
	scope: McpScope,
	name: string,
): Promise<string | undefined> {
	const { value } = await mcpDocument(scope, home, projectDir).read();
	const entry = (value.mcpServers ?? {})[name];
	if (entry === undefined) return undefined;
	return JSON.stringify(redactEntry(entry), null, 2);
}

export const writeMcpRaw = async (
	home: AgentHome,
	projectDir: string,
	scope: McpScope,
	name: string,
	text: string,
): Promise<void> => {
	let parsed: McpRawEntry;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		throw new Error(error instanceof Error ? error.message : "The text is not valid JSON.");
	}
	if (!isRecord(parsed)) throw new Error("The entry must be a JSON object.");
	return mcpDocument(scope, home, projectDir).update((document) => {
		const servers = document.mcpServers ?? {};
		const next = restoreStored(parsed, servers[name]);
		const read = readMcpEntry(name, next);
		if (read.kind === "invalid") throw new Error(read.problem);
		if (scope === "project" && read.kind !== "override") {
			const problem = projectEntryProblem(read.entry);
			if (problem !== undefined) throw new Error(problem);
		}
		servers[name] = next;
		return { ...document, mcpServers: servers };
	});
};
