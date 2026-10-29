/**
 * MCP servers live in `mcp.json`, the file pi and other MCP clients share. The
 * loader and its add/remove helpers are not exported from pi's package, so the
 * dashboard parses the documented `mcpServers` shape and keeps every other key
 * (ADR-0012). A running session picks the change up through `reload`.
 */
import type { McpServerInput, McpServerView } from "shared";
import { z } from "zod";

import { mcpPath, readJson, readJsonForWrite, writeJson } from "./store";

/** Only the fields the panel edits; `.loose()` keeps OAuth and exposure keys. */
const serverEntrySchema = z.looseObject({
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
	env: z.record(z.string(), z.string()).optional(),
	url: z.string().optional(),
	headers: z.record(z.string(), z.string()).optional(),
	description: z.string().optional(),
	enabled: z.boolean().optional(),
});

export const mcpFileSchema = z.looseObject({
	mcpServers: z.record(z.string(), serverEntrySchema).optional(),
});

type McpFile = z.infer<typeof mcpFileSchema>;
type ServerEntry = z.infer<typeof serverEntrySchema>;

const EMPTY_FILE: McpFile = {};

const targetOf = (config: ServerEntry): string => {
	if (config.url !== undefined) return config.url;
	return [config.command ?? "", ...(config.args ?? [])].join(" ").trim();
};

export const listMcpServers = async (home: string): Promise<McpServerView[]> => {
	const file = await readJson(mcpPath(home), mcpFileSchema, EMPTY_FILE);
	return Object.entries(file.mcpServers ?? {})
		.map(([name, config]) => ({
			name,
			transport: config.url === undefined ? ("stdio" as const) : ("http" as const),
			target: targetOf(config),
			description: config.description,
			enabled: config.enabled !== false,
		}))
		.sort((left, right) => left.name.localeCompare(right.name));
};

export const writeMcpServer = async (home: string, input: McpServerInput): Promise<void> => {
	const file = await readJsonForWrite(mcpPath(home), mcpFileSchema, EMPTY_FILE);
	const servers = file.mcpServers ?? {};
	const next = { ...(servers[input.name] ?? {}) };

	if (input.description === undefined || input.description === "") delete next.description;
	else next.description = input.description;
	if (input.enabled === false) next.enabled = false;
	else delete next.enabled;

	// The transport decides which fields exist, so switching one clears the
	// other's target instead of leaving a server with two of them.
	if (input.transport === "stdio") {
		delete next.url;
		delete next.headers;
		next.command = input.command;
		if (input.args !== undefined && input.args.length > 0) next.args = input.args;
		else delete next.args;
		if (input.env !== undefined && Object.keys(input.env).length > 0) next.env = input.env;
		else delete next.env;
	} else {
		delete next.command;
		delete next.args;
		delete next.env;
		next.url = input.url;
		if (input.headers !== undefined && Object.keys(input.headers).length > 0) {
			next.headers = input.headers;
		} else {
			delete next.headers;
		}
	}

	await writeJson(mcpPath(home), {
		...file,
		mcpServers: { ...servers, [input.name]: next },
	});
};

export const removeMcpServer = async (home: string, name: string): Promise<void> => {
	const file = await readJsonForWrite(mcpPath(home), mcpFileSchema, EMPTY_FILE);
	const servers = { ...(file.mcpServers ?? {}) };
	delete servers[name];
	await writeJson(mcpPath(home), { ...file, mcpServers: servers });
};
