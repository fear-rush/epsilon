/**
 * Reads an MCP config pasted from another client into servers Epsilon can write.
 * The shapes in the wild differ in the wrapper only: `{ "mcpServers": {...} }`
 * (Claude, Cursor), `{ "servers": {...} }` (VS Code), `{ "mcp": { "servers": ... } }`
 * (VS Code settings), a bare `{ "<name>": {...} }`, or a single entry that needs
 * a name. Each entry is then checked against the same rules the write route runs,
 * and an entry pi would refuse comes back with the reason instead of being dropped.
 */
import { z } from "zod";

import { mcpExposureSchema, mcpNameSchema, mcpToolExposureSchema } from "./rules";
import type { McpExposure, McpToolExposure } from "./rules";

type ImportedCommon = {
	description?: string;
	exposure?: McpExposure;
	toolExposure?: McpToolExposure;
	timeout?: number;
};

export type ImportedTarget =
	| {
			transport: "stdio";
			command: string;
			args: string[];
			env: Record<string, string>;
			cwd?: string;
	  }
	| { transport: "http"; url: string; headers: Record<string, string> };

export type ImportedServer = ImportedCommon & ImportedTarget;

/** One entry of the paste: a server to add, or the reason it cannot be. */
export type ImportedEntry = {
	/** Empty for a single entry pasted without a name. */
	name: string;
	/** Present when the entry can be added. */
	server: ImportedServer | undefined;
	/** Why the entry cannot be added. */
	problem: string | undefined;
	/** Keys of the entry this version does not carry over, so nothing disappears silently. */
	ignored: string[];
};

export type ParsedMcpPaste =
	| { ok: true; entries: ImportedEntry[]; needsName: boolean }
	| { ok: false; error: string };

const KEPT_KEYS = new Set([
	"type",
	"command",
	"args",
	"env",
	"cwd",
	"url",
	"headers",
	"description",
	"exposure",
	"toolExposure",
	"timeout",
]);

const SSE_PROBLEM =
	"pi does not support the legacy SSE transport; use the server's streamable HTTP URL.";

/** Env and header values are strings in `mcp.json`; a number or boolean in a paste reads as its text. */
const stringsSchema = z
	.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
	.transform((map) =>
		Object.fromEntries(Object.entries(map).map(([key, item]) => [key, String(item)])),
	);

/** The keys of an entry this version reads; anything else is named as ignored. */
const entrySchema = z.looseObject({
	type: z.string().optional(),
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
	env: stringsSchema.optional(),
	cwd: z.string().optional(),
	url: z.string().optional(),
	headers: stringsSchema.optional(),
	description: z.string().optional(),
	exposure: z.union([mcpExposureSchema, z.literal("codemode-deferred")]).optional(),
	toolExposure: mcpToolExposureSchema.optional(),
	timeout: z.number().positive().optional(),
});

const jsonMapSchema = z.record(z.string(), z.json());

/** Where the servers of a wrapped paste live, one wrapper at a time. */
const wrapperSchema = z.looseObject({
	mcpServers: jsonMapSchema.optional(),
	servers: jsonMapSchema.optional(),
	mcp: z.looseObject({ servers: jsonMapSchema.optional() }).optional(),
});

/** A bare map of servers: every value is itself an object. */
const bareMapSchema = z.record(z.string(), jsonMapSchema);

/** A single entry pasted without a name: it carries a command or a url of its own. */
const singleSchema = z.looseObject({ command: z.string() }).or(z.looseObject({ url: z.string() }));

const issueText = (error: z.ZodError): string => {
	const issue = error.issues[0];
	if (issue === undefined) return "This entry could not be read.";
	const path = issue.path.join(".");
	return path === "" ? issue.message : `${path}: ${issue.message}`;
};

function readEntry(name: string, raw: z.infer<typeof z.json>): ImportedEntry {
	const refuse = (problem: string, ignored: string[] = []): ImportedEntry => ({
		name,
		server: undefined,
		problem,
		ignored,
	});
	const parsed = entrySchema.safeParse(raw);
	if (!parsed.success) return refuse(issueText(parsed.error));
	const entry = parsed.data;
	const ignored = Object.keys(entry).filter((key) => !KEPT_KEYS.has(key));
	if (name !== "") {
		const named = mcpNameSchema.safeParse(name);
		if (!named.success) {
			return refuse(
				named.error.issues[0]?.message ?? "Use letters, digits, dashes and underscores",
				ignored,
			);
		}
	}

	const type = entry.type?.toLowerCase();
	if (type === "sse") return refuse(SSE_PROBLEM, ignored);

	const common: ImportedCommon = {};
	if (entry.description !== undefined && entry.description.trim() !== "") {
		common.description = entry.description.trim();
	}
	if (entry.exposure !== undefined) {
		common.exposure = entry.exposure === "codemode-deferred" ? "codemode" : entry.exposure;
	}
	if (entry.toolExposure !== undefined) common.toolExposure = entry.toolExposure;
	if (entry.timeout !== undefined) common.timeout = entry.timeout;

	const command = entry.command?.trim() ?? "";
	const url = entry.url?.trim() ?? "";
	if (command !== "" && url !== "") {
		return refuse("This entry has both a command and a url.", ignored);
	}

	if (command !== "") {
		if (type !== undefined && type !== "stdio") {
			return refuse(`A command entry cannot have the type "${type}".`, ignored);
		}
		const server: ImportedServer = {
			...common,
			transport: "stdio",
			command,
			args: entry.args ?? [],
			env: entry.env ?? {},
		};
		const cwd = entry.cwd?.trim() ?? "";
		if (cwd !== "") server.cwd = cwd;
		return { name, server, problem: undefined, ignored };
	}

	if (url !== "") {
		if (type !== undefined && type !== "http" && type !== "streamable-http") {
			return refuse(`A url entry cannot have the type "${type}".`, ignored);
		}
		if (!URL.canParse(url) || !/^https?:$/.test(new URL(url).protocol)) {
			return refuse("The url must be an absolute http or https URL.", ignored);
		}
		return {
			name,
			server: { ...common, transport: "http", url, headers: entry.headers ?? {} },
			problem: undefined,
			ignored,
		};
	}
	return refuse("This entry has neither a command nor a url.", ignored);
}

/** The text as JSON; a pasted `"name": { ... }` fragment, as READMEs show it, is wrapped. */
function parseJson(
	text: string,
): { ok: true; root: z.infer<typeof jsonMapSchema> } | { ok: false; error: string } {
	const trimmed = text.trim();
	if (trimmed === "") return { ok: false, error: "Paste a JSON snippet." };
	const attempts = trimmed.startsWith("{")
		? [trimmed]
		: [trimmed, `{${trimmed.replace(/,\s*$/, "")}}`];
	let first: string | undefined;
	for (const attempt of attempts) {
		try {
			const root = jsonMapSchema.safeParse(JSON.parse(attempt));
			return root.success
				? { ok: true, root: root.data }
				: { ok: false, error: "Expected a JSON object." };
		} catch (error) {
			first ??= error instanceof Error ? error.message : "Invalid JSON";
		}
	}
	return { ok: false, error: `That is not valid JSON: ${first ?? "unreadable"}` };
}

export function parseMcpPaste(text: string): ParsedMcpPaste {
	const json = parseJson(text);
	if (!json.ok) return json;
	const { root } = json;

	const wrapper = wrapperSchema.safeParse(root);
	const wrapped = wrapper.success
		? (wrapper.data.mcpServers ?? wrapper.data.servers ?? wrapper.data.mcp?.servers)
		: undefined;
	if (wrapped === undefined && singleSchema.safeParse(root).success) {
		return { ok: true, entries: [readEntry("", root)], needsName: true };
	}
	if (wrapped === undefined && !bareMapSchema.safeParse(root).success) {
		return {
			ok: false,
			error:
				'Expected { "mcpServers": {...} }, { "servers": {...} }, a map of servers, or one server with a command or url.',
		};
	}
	const map = wrapped ?? root;
	const names = Object.keys(map);
	if (names.length === 0) return { ok: false, error: "No server found in this snippet." };
	return {
		ok: true,
		entries: names.map((name) => readEntry(name, map[name] ?? null)),
		needsName: false,
	};
}

/**
 * Whether a pasted env or header value still waits for the person's own: empty,
 * `<YOUR_KEY>`, `${NAME}` or a "your-key-here" style filler.
 */
export function isPlaceholderValue(value: string): boolean {
	const text = value.trim();
	if (text === "") return true;
	if (/^<[^>]*>$/.test(text) || /^\[[^\]]*\]$/.test(text)) return true;
	if (text.includes("${")) return true;
	return /(your[-_ ]?[\w-]*(key|token|secret|password)|[-_ ]here$|changeme|xxx+|^todo$|^\.\.\.$)/i.test(
		text,
	);
}

/** A `${NAME}` reference pi resolves from the dashboard's environment; blank keeps it. */
export const isEnvReference = (value: string): boolean => /\$\{[^}]+\}/.test(value);

/** An env variable or header of an imported server that still needs the person's own value. */
export type MissingValue = {
	kind: "env" | "headers";
	key: string;
	/** The text as pasted, empty or a placeholder. */
	pasted: string;
};

/** The key a typed value is stored under: one per variable or header of one server. */
export const missingValueId = (value: Pick<MissingValue, "kind" | "key">): string =>
	`${value.kind}\0${value.key}`;

/** Every env variable and header of the server whose pasted value is empty or a placeholder. */
export function missingValuesOf(server: ImportedServer): MissingValue[] {
	const pairs: [MissingValue["kind"], Record<string, string>][] =
		server.transport === "stdio" ? [["env", server.env]] : [["headers", server.headers]];
	return pairs.flatMap(([kind, map]) =>
		Object.entries(map)
			.filter(([, pasted]) => isPlaceholderValue(pasted))
			.map(([key, pasted]) => ({ kind, key, pasted })),
	);
}

/**
 * The server with the typed values in place of its placeholders. A value left
 * blank drops the variable, except a `${NAME}` reference, which pi resolves from
 * the dashboard's environment and so stays as written.
 */
export function withValues(
	server: ImportedServer,
	typed: Readonly<Record<string, string>>,
): ImportedServer {
	const fill = (kind: MissingValue["kind"], map: Record<string, string>): Record<string, string> =>
		Object.fromEntries(
			Object.entries(map).flatMap(([key, pasted]): [string, string][] => {
				if (!isPlaceholderValue(pasted)) return [[key, pasted]];
				const value = typed[missingValueId({ kind, key })] ?? "";
				if (value !== "") return [[key, value]];
				return isEnvReference(pasted) ? [[key, pasted]] : [];
			}),
		);
	return server.transport === "stdio"
		? { ...server, env: fill("env", server.env) }
		: { ...server, headers: fill("headers", server.headers) };
}
