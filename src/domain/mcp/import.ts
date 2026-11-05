/**
 * Reads an MCP config pasted from another client into servers Epsilon can write.
 *
 * The shapes in the wild differ in the wrapper only: `{ "mcpServers": {...} }`
 * (Claude, Cursor), `{ "servers": {...} }` (VS Code), `{ "mcp": { "servers": ... } }`
 * (VS Code settings), a bare `{ "<name>": {...} }`, or a single entry that needs a name.
 * Each entry is then checked against the same rules the write route runs, and an entry
 * pi would refuse comes back with the reason instead of being dropped.
 */
/* oxlint-disable anti-slop/no-runtime-typeof -- this file reads JSON pasted from another
   client: every field is checked by shape, and a wrong one becomes the entry's problem. */
import { Option, Schema } from "effect";
import type { Json, JsonObject } from "effect/Schema";

import type { McpExposure, McpToolExposure } from "#protocol/settings/mcp";

import { isMcpName, mcpExposures } from "./rules.ts";

type ImportedCommon = {
	readonly description?: string;
	readonly exposure?: McpExposure;
	readonly toolExposure?: McpToolExposure;
	readonly timeout?: number;
};

export type ImportedTarget =
	| {
			readonly transport: "stdio";
			readonly command: string;
			readonly args: ReadonlyArray<string>;
			readonly env: Readonly<Record<string, string>>;
			readonly cwd?: string;
	  }
	| {
			readonly transport: "http";
			readonly url: string;
			readonly headers: Readonly<Record<string, string>>;
	  };

export type ImportedServer = ImportedCommon & ImportedTarget;

/** One entry of the paste: a server to add, or the reason it cannot be. */
export type ImportedEntry = {
	/** Empty for a single entry pasted without a name. */
	readonly name: string;
	/** Present when the entry can be added. */
	readonly server: ImportedServer | undefined;
	/** Why the entry cannot be added. */
	readonly problem: string | undefined;
	/** Keys of the entry this version does not carry over, so nothing disappears silently. */
	readonly ignored: ReadonlyArray<string>;
};

export type ParsedMcpPaste =
	| {
			readonly ok: true;
			readonly entries: ReadonlyArray<ImportedEntry>;
			readonly needsName: boolean;
	  }
	| { readonly ok: false; readonly error: string };

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

/** Another client's alias for codemode, which pi reads as the same exposure. */
type PastedExposure = McpExposure | "codemode-deferred";

const isExposure = (value: string): value is McpExposure =>
	mcpExposures.some((exposure) => exposure === value);

const exposureOf = (value: Json | undefined): PastedExposure | undefined => {
	if (typeof value !== "string") return undefined;
	if (value === "codemode-deferred" || isExposure(value)) return value;
	return undefined;
};

// A pasted entry is JSON, so its object-ness is checked here; every field is then read by
// name below, and a field of the wrong shape is the entry's problem, not a thrown error.
const isRecord = (value: Json | undefined): value is JsonObject => {
	if (value === null) return false;
	if (typeof value !== "object") return false;
	return !Array.isArray(value);
};

/** Env and header values are strings in `mcp.json`; a number or boolean reads as its text. */
const stringMap = (value: Json | undefined): Record<string, string> | undefined => {
	if (!isRecord(value)) return undefined;
	const entries: [string, string][] = [];
	for (const [key, item] of Object.entries(value)) {
		if (typeof item === "string") entries.push([key, item]);
		else if (typeof item === "number" || typeof item === "boolean") {
			entries.push([key, String(item)]);
		} else return undefined;
	}
	return Object.fromEntries(entries);
};

const toolExposureOf = (value: Json | undefined): McpToolExposure | undefined => {
	if (!isRecord(value)) return undefined;
	const entries: [string, McpExposure][] = [];
	for (const [key, item] of Object.entries(value)) {
		const exposure = exposureOf(item);
		if (exposure === undefined || exposure === "codemode-deferred") return undefined;
		entries.push([key, exposure]);
	}
	return Object.fromEntries(entries);
};

/** The entry's fields, read leniently; a field of the wrong shape is named as the problem. */
type RawEntry = {
	type?: string;
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
	url?: string;
	headers?: Record<string, string>;
	description?: string;
	exposure?: PastedExposure;
	toolExposure?: McpToolExposure;
	timeout?: number;
};

const fieldProblem = (raw: JsonObject, entry: RawEntry): string | undefined => {
	const stringField = (key: string): string | undefined => {
		const value = raw[key];
		if (value === undefined || typeof value === "string") return undefined;
		return `${key}: expected a string`;
	};
	const text = ["type", "command", "cwd", "url", "description"]
		.map(stringField)
		.find((problem) => problem !== undefined);
	if (text !== undefined) return text;
	if (raw["args"] !== undefined) {
		const args = raw["args"];
		if (!Array.isArray(args) || !args.every((arg): arg is string => typeof arg === "string")) {
			return "args: expected a list of strings";
		}
		entry.args = args;
	}
	for (const key of ["env", "headers"] as const) {
		if (raw[key] === undefined) continue;
		const map = stringMap(raw[key]);
		if (map === undefined) return `${key}: expected a map of strings`;
		entry[key] = map;
	}
	if (raw["exposure"] !== undefined) {
		const exposure = exposureOf(raw["exposure"]);
		if (exposure === undefined) {
			return `exposure: expected one of ${mcpExposures.join(", ")}`;
		}
		entry.exposure = exposure;
	}
	if (raw["toolExposure"] !== undefined) {
		const toolExposure = toolExposureOf(raw["toolExposure"]);
		if (toolExposure === undefined) return "toolExposure: expected exposure values";
		entry.toolExposure = toolExposure;
	}
	if (raw["timeout"] !== undefined) {
		const timeout = raw["timeout"];
		if (typeof timeout !== "number" || !(timeout > 0)) {
			return "timeout: expected a positive number";
		}
		entry.timeout = timeout;
	}
	for (const key of ["type", "command", "cwd", "url", "description"] as const) {
		const value = raw[key];
		if (typeof value === "string") entry[key] = value;
	}
	return undefined;
};

function readEntry(name: string, raw: Json): ImportedEntry {
	const refuse = (problem: string, ignored: ReadonlyArray<string> = []): ImportedEntry => ({
		ignored,
		name,
		problem,
		server: undefined,
	});
	if (!isRecord(raw)) return refuse("This entry could not be read.");
	const ignored = Object.keys(raw).filter((key) => !KEPT_KEYS.has(key));
	if (name !== "" && !isMcpName(name))
		return refuse("Use letters, digits, dashes and underscores", ignored);

	const entry: RawEntry = {};
	const wrong = fieldProblem(raw, entry);
	if (wrong !== undefined) return refuse(wrong, ignored);

	const type = entry.type?.toLowerCase();
	if (type === "sse") return refuse(SSE_PROBLEM, ignored);

	const common: { -readonly [K in keyof ImportedCommon]: ImportedCommon[K] } = {};
	if (entry.description !== undefined && entry.description.trim() !== "") {
		common.description = entry.description.trim();
	}
	if (entry.exposure === "codemode-deferred") common.exposure = "codemode";
	else if (entry.exposure !== undefined) common.exposure = entry.exposure;
	if (entry.toolExposure !== undefined) common.toolExposure = entry.toolExposure;
	if (entry.timeout !== undefined) common.timeout = entry.timeout;

	const command = entry.command?.trim() ?? "";
	const url = entry.url?.trim() ?? "";
	if (command !== "" && url !== "")
		return refuse("This entry has both a command and a url.", ignored);

	if (command !== "") {
		if (type !== undefined && type !== "stdio") {
			return refuse(`A command entry cannot have the type "${type}".`, ignored);
		}
		const server = {
			...common,
			args: entry.args ?? [],
			command,
			env: entry.env ?? {},
			transport: "stdio",
		} satisfies ImportedServer;
		const cwd = entry.cwd?.trim() ?? "";
		return { ignored, name, problem: undefined, server: cwd === "" ? server : { ...server, cwd } };
	}

	if (url !== "") {
		if (type !== undefined && type !== "http" && type !== "streamable-http") {
			return refuse(`A url entry cannot have the type "${type}".`, ignored);
		}
		if (!URL.canParse(url) || !/^https?:$/.test(new URL(url).protocol)) {
			return refuse("The url must be an absolute http or https URL.", ignored);
		}
		return {
			ignored,
			name,
			problem: undefined,
			server: { ...common, headers: entry.headers ?? {}, transport: "http", url },
		};
	}
	return refuse("This entry has neither a command nor a url.", ignored);
}

type ParseJson =
	| { readonly ok: true; readonly root: JsonObject }
	| { readonly ok: false; readonly error: string };

/** The text as JSON; a pasted `"name": { ... }` fragment, as READMEs show it, is wrapped. */
function parseJson(text: string): ParseJson {
	const trimmed = text.trim();
	if (trimmed === "") return { error: "Paste a JSON snippet.", ok: false };
	const attempts = trimmed.startsWith("{")
		? [trimmed]
		: [trimmed, `{${trimmed.replace(/,\s*$/, "")}}`];
	let first: string | undefined;
	for (const attempt of attempts) {
		try {
			// The paste is JSON from another client, so it is decoded as JSON here and
			// checked field by field below; a field of the wrong shape is an entry problem.
			const decoded: unknown = JSON.parse(attempt);
			const root = Schema.decodeUnknownOption(Schema.JsonObject)(decoded);
			if (Option.isNone(root)) return { error: "Expected a JSON object.", ok: false };
			return { ok: true, root: root.value };
		} catch (error) {
			first ??= error instanceof Error ? error.message : "Invalid JSON";
		}
	}
	return { error: `That is not valid JSON: ${first ?? "unreadable"}`, ok: false };
}

/** The map of servers inside a wrapper, or the entry itself when it carries a target. */
const wrappedMap = (root: JsonObject): JsonObject | undefined => {
	const nested = isRecord(root["mcp"]) ? root["mcp"]["servers"] : undefined;
	for (const candidate of [root["mcpServers"], root["servers"], nested]) {
		if (isRecord(candidate)) return candidate;
	}
	return undefined;
};

const isSingleEntry = (root: JsonObject): boolean => {
	if (typeof root["command"] === "string") return true;
	return typeof root["url"] === "string";
};

const isBareMap = (root: JsonObject): boolean => {
	const values = Object.values(root);
	return values.length > 0 && values.every((value) => isRecord(value));
};

export function parseMcpPaste(text: string): ParsedMcpPaste {
	const json = parseJson(text);
	if (!json.ok) return json;
	const { root } = json;

	const wrapped = wrappedMap(root);
	if (wrapped === undefined && isSingleEntry(root)) {
		return { entries: [readEntry("", root)], needsName: true, ok: true };
	}
	if (wrapped === undefined && !isBareMap(root)) {
		return {
			error:
				'Expected { "mcpServers": {...} }, { "servers": {...} }, a map of servers, or one server with a command or url.',
			ok: false,
		};
	}
	const map = wrapped ?? root;
	const names = Object.keys(map);
	if (names.length === 0) return { error: "No server found in this snippet.", ok: false };
	return {
		entries: names.map((name) => readEntry(name, map[name] ?? null)),
		needsName: false,
		ok: true,
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
	readonly kind: "env" | "headers";
	readonly key: string;
	/** The text as pasted, empty or a placeholder. */
	readonly pasted: string;
};

/** The key a typed value is stored under: one per variable or header of one server. */
export const missingValueId = (value: Pick<MissingValue, "kind" | "key">): string =>
	`${value.kind}\0${value.key}`;

/** Every env variable and header of the server whose pasted value is empty or a placeholder. */
export function missingValuesOf(server: ImportedServer): MissingValue[] {
	const pairs: [MissingValue["kind"], Readonly<Record<string, string>>][] =
		server.transport === "stdio" ? [["env", server.env]] : [["headers", server.headers]];
	return pairs.flatMap(([kind, map]) =>
		Object.entries(map)
			.filter(([, pasted]) => isPlaceholderValue(pasted))
			.map(([key, pasted]) => ({ key, kind, pasted })),
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
	const fill = (
		kind: MissingValue["kind"],
		map: Readonly<Record<string, string>>,
	): Record<string, string> =>
		Object.fromEntries(
			Object.entries(map).flatMap(([key, pasted]): [string, string][] => {
				if (!isPlaceholderValue(pasted)) return [[key, pasted]];
				const value = typed[missingValueId({ key, kind })] ?? "";
				if (value !== "") return [[key, value]];
				return isEnvReference(pasted) ? [[key, pasted]] : [];
			}),
		);
	if (server.transport === "stdio") return { ...server, env: fill("env", server.env) };
	return { ...server, headers: fill("headers", server.headers) };
}
