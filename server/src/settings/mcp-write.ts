/**
 * Every write to one `mcp.json`: saving a server, switching it, removing it, and
 * the project override of a global server. Each one is a serialized
 * read-modify-write on its file, keeps unknown keys, and never replaces a file it
 * cannot parse.
 *
 * `enabled` is the switch's to write, never a form save: `false` writes the key
 * and `true` removes it, as pi's own writer does, except on an override, which
 * keeps the value written because it replaces the global entry's.
 */
import type { McpInProjectInput, McpScope, McpServerInput } from "shared";

import { isRawOverride, isRecord, readMcpEntry, readRawObject, stringMapOf } from "./mcp-entry";
import type { McpRawEntry } from "./mcp-entry";
import {
	mcpScopePath,
	projectMcpPath,
	readMcpDocument,
	readMcpDocumentForWrite,
	withMcpFile,
	writeMcpDocument,
} from "./mcp-file";

function mergeStoredMap(
	incoming: Record<string, string> | undefined,
	stored: McpRawEntry | undefined,
): Record<string, string> | undefined {
	if (incoming === undefined || Object.keys(incoming).length === 0) return undefined;
	const previous = stringMapOf(stored);
	const merged: Record<string, string> = {};
	for (const [key, value] of Object.entries(incoming)) {
		const kept = previous[key];
		if (value === "" && kept !== undefined) merged[key] = kept;
		else if (value === "") throw new Error(`Add a value for "${key}", or remove the row.`);
		else merged[key] = value;
	}
	return merged;
}

const validHttpUrl = (url: string): void => {
	if (!URL.canParse(url) || !/^https?:$/.test(new URL(url).protocol)) {
		throw new Error("An MCP URL must start with http:// or https://.");
	}
};

/** Save one server into the file its scope names. */
export async function writeMcpServer(
	home: string,
	projectDir: string,
	input: McpServerInput,
): Promise<void> {
	const path = mcpScopePath(input.scope, home, projectDir);
	await withMcpFile(path, async () => {
		const document = await readMcpDocumentForWrite(path);
		const servers = document.mcpServers ?? {};
		const existing = servers[input.name];
		if (existing !== undefined && !isRecord(existing)) {
			throw new Error(
				`"${input.name}" is not an object in this file; remove it there before editing here.`,
			);
		}
		if (input.scope === "project" && existing !== undefined && isRawOverride(existing)) {
			throw new Error(
				`"${input.name}" in this project only overrides a global server. Change that server, or remove the override.`,
			);
		}
		const next = { ...readRawObject(existing) };
		// The transport decides which target exists; `type` is optional, so leaving it
		// out cannot disagree with the target we write.
		delete next.type;
		if (input.description === undefined || input.description === "") delete next.description;
		else next.description = input.description;
		if (input.exposure === undefined || input.exposure === "codemode") delete next.exposure;
		else next.exposure = input.exposure;
		if (input.timeout === undefined) delete next.timeout;
		else next.timeout = input.timeout;

		if (input.transport === "stdio") {
			delete next.url;
			delete next.headers;
			delete next.oauth;
			delete next.auth;
			next.command = input.command;
			if (input.args !== undefined && input.args.length > 0) next.args = input.args;
			else delete next.args;
			if (input.cwd !== undefined && input.cwd !== "") next.cwd = input.cwd;
			else delete next.cwd;
			const env = mergeStoredMap(input.env, next.env);
			if (env !== undefined) next.env = env;
			else delete next.env;
		} else {
			validHttpUrl(input.url);
			delete next.command;
			delete next.args;
			delete next.env;
			delete next.cwd;
			next.url = input.url;
			const headers = mergeStoredMap(input.headers, next.headers);
			if (headers !== undefined) next.headers = headers;
			else delete next.headers;
		}

		servers[input.name] = next;
		document.mcpServers = servers;
		await writeMcpDocument(input.scope, path, document);
	});
}

export async function removeMcpServer(
	home: string,
	projectDir: string,
	scope: McpScope,
	name: string,
): Promise<void> {
	const path = mcpScopePath(scope, home, projectDir);
	await withMcpFile(path, async () => {
		const document = await readMcpDocumentForWrite(path);
		const servers = document.mcpServers ?? {};
		if (servers[name] === undefined) {
			throw new Error(`mcp.json does not define "${name}" any more.`);
		}
		delete servers[name];
		document.mcpServers = servers;
		await writeMcpDocument(scope, path, document);
	});
}

/** Turn one server on or off in its own file, as pi's `/mcp` writes it. */
export async function setMcpServerEnabled(
	home: string,
	projectDir: string,
	scope: McpScope,
	name: string,
	enabled: boolean,
): Promise<void> {
	const path = mcpScopePath(scope, home, projectDir);
	await withMcpFile(path, async () => {
		const document = await readMcpDocumentForWrite(path);
		const servers = document.mcpServers ?? {};
		const existing = servers[name];
		if (existing === undefined) throw new Error(`mcp.json does not define "${name}" any more.`);
		if (!isRecord(existing)) {
			throw new Error(`"${name}" is not an object, so it cannot be turned on or off.`);
		}
		const next = { ...readRawObject(existing) };
		if (enabled && !isRawOverride(existing)) delete next.enabled;
		else next.enabled = enabled;
		servers[name] = next;
		document.mcpServers = servers;
		await writeMcpDocument(scope, path, document);
	});
}

/**
 * A global server's state in this project: `inherit` removes the project's
 * override, `on` and `off` write one. A project server of the same name is never
 * touched, and a global server that does not load cannot be overridden.
 */
export async function setMcpServerInProject(
	home: string,
	projectDir: string,
	input: McpInProjectInput,
): Promise<void> {
	const globalDocument = await readMcpDocument(mcpScopePath("global", home, projectDir));
	const globalValue = (globalDocument.document.mcpServers ?? {})[input.name];
	const globalRead = globalValue === undefined ? undefined : readMcpEntry(input.name, globalValue);
	if (globalRead?.kind !== "server") {
		throw new Error(`The global mcp.json does not define a server named "${input.name}".`);
	}
	const path = projectMcpPath(projectDir);
	await withMcpFile(path, async () => {
		const document = await readMcpDocumentForWrite(path);
		const servers = document.mcpServers ?? {};
		const existing = servers[input.name];
		if (existing !== undefined && !isRawOverride(existing)) {
			throw new Error(
				`This project defines its own server "${input.name}". Edit or remove that server instead.`,
			);
		}
		if (input.value === "inherit") {
			if (existing === undefined) return;
			delete servers[input.name];
		} else {
			const next = { ...readRawObject(existing) };
			next.enabled = input.value === "on";
			servers[input.name] = next;
		}
		document.mcpServers = servers;
		await writeMcpDocument("project", path, document);
	});
}
