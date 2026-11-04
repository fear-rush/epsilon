import { Result, Schema } from "effect";

import {
	McpExposure,
	type McpOverrideKey,
	type McpScope,
	type McpTransport,
} from "#protocol/settings/mcp";

import {
	authProviderProblem,
	isHttpUrl,
	mcpNamespaceOf,
	mcpOverrideKeys,
	oauthProblem,
} from "../../../domain/mcp/rules.ts";
import { withDefined } from "../../../domain/object.ts";
import { isJsonObject } from "../../platform/patch.ts";
import type { JsonObject, JsonValue } from "../../platform/patch.ts";

/**
 * One `mcpServers` entry, read the way pi reads it, and the two files resolved together.
 *
 * An entry with `command`, `url` or `type` defines a server; one without them only
 * changes `enabled`, `exposure` and `toolExposure` of the global server of its name.
 * pi exports no validator Epsilon can reach through its package, so the shape and the
 * rules are restated from its installed reader: a field the entry's transport never uses
 * is not inspected, and an entry pi would skip is reported instead of guessed at.
 */

/** `codemode-deferred` is the name pi used before; it still reads it as `codemode`. */
const StoredExposure = Schema.Union([McpExposure, Schema.Literal("codemode-deferred")]);

const StoredOAuth = Schema.Struct({
	clientId: Schema.optional(Schema.String),
	clientSecret: Schema.optional(Schema.String),
	callbackPort: Schema.optional(Schema.Int),
	callbackUrl: Schema.optional(Schema.String),
	scope: Schema.optional(Schema.String),
	clientName: Schema.optional(Schema.String),
	clientRegistration: Schema.optional(Schema.Literals(["dcr", "cimd"])),
	authServerMetadataUrl: Schema.optional(Schema.String),
});

const StoredAuth = Schema.Struct({ provider: Schema.String });

/** The `type` an entry may name; `sse` is accepted here so the refusal can name it. */
const EntryType = Schema.Literals(["stdio", "http", "streamable-http", "sse"]);

/** The fields pi's `validateMcpServerConfig()` reads, before its per-transport split. */
const EntryFields = Schema.Struct({
	type: Schema.optional(EntryType),
	command: Schema.optional(Schema.String),
	args: Schema.optional(Schema.Array(Schema.String)),
	env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	cwd: Schema.optional(Schema.String),
	url: Schema.optional(Schema.String),
	headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	oauth: Schema.optional(StoredOAuth),
	auth: Schema.optional(StoredAuth),
	exposure: Schema.optional(StoredExposure),
	toolExposure: Schema.optional(Schema.Record(Schema.String, StoredExposure)),
	enabled: Schema.optional(Schema.Boolean),
	description: Schema.optional(Schema.String),
	/** Seconds, positive; pi's default is 60. */
	timeout: Schema.optional(Schema.Finite.pipe(Schema.check(Schema.isGreaterThan(0)))),
});

type StoredEntry = typeof EntryFields.Type;

/** One entry pi would read, with the legacy exposure names already resolved. */
export type McpEntry = Omit<StoredEntry, "exposure" | "toolExposure"> & {
	readonly exposure?: McpExposure | undefined;
	readonly toolExposure?: Readonly<Record<string, McpExposure>> | undefined;
};

/** One entry as pi would read it. */
export type McpEntryRead =
	| { readonly kind: "invalid"; readonly problem: string }
	| {
			readonly kind: "override";
			readonly entry: McpEntry;
			readonly keys: ReadonlyArray<McpOverrideKey>;
	  }
	| {
			readonly kind: "server";
			readonly entry: McpEntry;
			readonly transport: McpTransport;
	  };

/** One entry of either file, as the list and the detail show it. */
export type McpServer =
	| {
			readonly kind: "server";
			readonly name: string;
			readonly scope: McpScope;
			/** What pi connects. */
			readonly config: McpEntry;
			readonly transport: McpTransport;
			/** How the other file's entry of this name relates to this one, when one does. */
			readonly relation?: "replaces-global" | "replaced-by-project" | "overridden-by-project";
	  }
	| {
			/** A project entry that only changes keys of the global server of its name. */
			readonly kind: "override";
			readonly name: string;
			readonly scope: "project";
			/** The global server's config with the override applied: what pi connects. */
			readonly config: McpEntry;
			readonly transport: McpTransport;
			readonly keys: ReadonlyArray<McpOverrideKey>;
			/** What the override sets `enabled` to, when it sets it. */
			readonly enabled?: boolean;
	  }
	| {
			/** pi skips this entry. `overrideKeys` is set when it was meant as an override. */
			readonly kind: "invalid";
			readonly name: string;
			readonly scope: McpScope;
			readonly problem: string;
			/** The entry's own `enabled`, so a row still shows Off while pi skips it. */
			readonly enabled: boolean;
			readonly overrideKeys?: ReadonlyArray<McpOverrideKey>;
			/** The file's object, so a form can prefill a repair from what pi can still read. */
			readonly raw: JsonObject;
	  };

type GlobalServer = Extract<McpServer, { kind: "server" }>;
type InvalidServer = Extract<McpServer, { kind: "invalid" }>;

const normalizeExposure = (
	value: "codemode" | "deferred" | "direct" | "hidden" | "codemode-deferred",
): McpExposure => (value === "codemode-deferred" ? "codemode" : value);

const normalize = (entry: StoredEntry): McpEntry => {
	const { exposure: storedExposure, toolExposure: storedToolExposure, ...rest } = entry;
	const exposure = storedExposure === undefined ? undefined : normalizeExposure(storedExposure);
	const toolExposure =
		storedToolExposure === undefined
			? undefined
			: Object.fromEntries(
					Object.entries(storedToolExposure).map(([key, value]) => [key, normalizeExposure(value)]),
				);
	return withDefined(withDefined(rest, "exposure", exposure), "toolExposure", toolExposure);
};

/** One entry's JSON object, kept exactly as the file holds it. */
const rawObject = (value: JsonValue | undefined): JsonObject => (isJsonObject(value) ? value : {});

/** One entry's record, or an empty one when the value is not an object. */
export const readRawObject = (value: JsonValue | undefined): JsonObject => rawObject(value);

/** A stored map of strings, which is what `env` and `headers` may hold. */
export const stringMapOf = (value: JsonValue | undefined) => {
	if (!isJsonObject(value)) return {};
	const kept: Record<string, string> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (typeof entry === "string") kept[key] = entry;
	}
	return kept;
};

/** The entry's own `enabled`, when it holds a boolean, so an invalid entry still shows it. */
const rawEnabled = (value: JsonValue | undefined): boolean | undefined => {
	if (!isJsonObject(value)) return undefined;
	const enabled = value["enabled"];
	return typeof enabled === "boolean" ? enabled : undefined;
};

/** Whether a raw entry names no target, so it can only be an override. */
export const isRawOverride = (value: JsonValue | undefined): boolean => {
	if (!isJsonObject(value)) return false;
	return (
		value["command"] === undefined && value["url"] === undefined && value["type"] === undefined
	);
};

/** The override keys the raw object sets, read even when the entry is otherwise invalid. */
const rawOverrideKeys = (value: JsonValue | undefined): ReadonlyArray<McpOverrideKey> => {
	if (!isJsonObject(value)) return [];
	return mcpOverrideKeys.filter((key) => value[key] !== undefined);
};

const rawType = (value: JsonValue | undefined): StoredEntry["type"] => {
	if (!isJsonObject(value)) return undefined;
	return Result.getOrUndefined(Schema.decodeUnknownResult(EntryType)(value["type"]));
};

/**
 * The keys pi's validator never looks at, for the transport the entry uses: it checks
 * `args`, `env` and `cwd` only for a stdio entry and `headers`, `oauth` and `auth` only
 * for an HTTP one. A value the transport ignores cannot make the entry invalid here
 * either, since pi would load it.
 */
const ignoredKeysOf = (raw: JsonObject): ReadonlyArray<string> => {
	const kind = rawType(raw);
	const url = raw["url"];
	const command = raw["command"];
	if (
		typeof url === "string" &&
		(kind === undefined || kind === "http" || kind === "streamable-http")
	) {
		return ["command", "args", "env", "cwd"];
	}
	if (typeof command === "string" && (kind === undefined || kind === "stdio")) {
		return ["headers", "oauth", "auth"];
	}
	return [];
};

const transportOf = (entry: McpEntry): McpTransport => (entry.url === undefined ? "stdio" : "http");

const definesServer = (entry: McpEntry): boolean =>
	entry.command !== undefined || entry.url !== undefined || entry.type !== undefined;

/** The keys an override sets, in pi's order. */
const overrideKeysOf = (entry: McpEntry): ReadonlyArray<McpOverrideKey> =>
	mcpOverrideKeys.filter((key) => entry[key] !== undefined);

/** The keys pi refuses in an override, read from the raw object so unknown keys count. */
const extraOverrideKeys = (raw: JsonObject): ReadonlyArray<string> =>
	Object.keys(raw).filter((key) => !mcpOverrideKeys.some((allowed) => allowed === key));

/**
 * The rules pi's validator applies on top of the field types: a valid server name, no
 * legacy SSE, a target that exists, an http(s) URL, and the `oauth` and `auth` options pi
 * will only send over https or to this machine.
 */
function entryProblem(name: string, entry: McpEntry): string | undefined {
	if (!/^[A-Za-z0-9_-]+$/.test(name)) {
		return "A server name may only use letters, digits, dashes and underscores.";
	}
	if (entry.type === "sse") {
		return "pi does not support the legacy SSE transport; use the server's streamable HTTP URL.";
	}
	const http =
		entry.url !== undefined &&
		(entry.type === undefined || entry.type === "http" || entry.type === "streamable-http");
	if (http) {
		if (!isHttpUrl(entry.url)) return "url must be an http or https URL.";
		if (entry.oauth !== undefined) {
			const problem = oauthProblem(entry.oauth);
			if (problem !== undefined) return problem;
		}
		if (entry.auth !== undefined) {
			const problem = authProviderProblem(entry.url);
			if (problem !== undefined) return problem;
		}
		return undefined;
	}
	const stdio = entry.command !== undefined && (entry.type === undefined || entry.type === "stdio");
	if (stdio) return undefined;
	return 'needs either "command" (stdio) or "url" (streamable HTTP).';
}

/**
 * The one rule that depends on the file an entry sits in: `auth` sends a `/login`
 * provider's token, and pi refuses it in a project's `mcp.json`. Both writers run it, so
 * a raw save cannot store an entry pi would skip.
 */
export const projectEntryProblem = (entry: McpEntry): string | undefined =>
	entry.url !== undefined && entry.auth !== undefined
		? "auth is only allowed in the global mcp.json."
		: undefined;

/** Parse one `mcpServers` value the way pi reads it, and say what it is. */
export function readMcpEntry(name: string, value: JsonValue | undefined): McpEntryRead {
	if (!isJsonObject(value)) {
		return { kind: "invalid", problem: "pi skips an entry that is not an object." };
	}
	const ignored = ignoredKeysOf(value);
	const checked = Object.fromEntries(
		Object.entries(value).filter(([key]) => !ignored.includes(key)),
	);
	const decoded = Schema.decodeUnknownResult(EntryFields)(checked);
	if (Result.isFailure(decoded)) {
		return { kind: "invalid", problem: decoded.failure.message };
	}
	const entry = normalize(decoded.success);
	if (!definesServer(entry)) {
		return { kind: "override", entry, keys: overrideKeysOf(entry) };
	}
	const problem = entryProblem(name, entry);
	if (problem !== undefined) return { kind: "invalid", problem };
	return { entry, kind: "server", transport: transportOf(entry) };
}

/** The keys of a stored map whose value is a string; one bad value hides one name only. */
const storedStringKeys = (value: JsonValue | undefined): ReadonlyArray<string> => {
	if (!isJsonObject(value)) return [];
	return Object.entries(value).flatMap(([key, entry]) => (typeof entry === "string" ? [key] : []));
};

/**
 * What an entry pi skips still says about its target, so the form can prefill a repair
 * instead of starting from the name alone. A value is kept only when it has the type its
 * field needs, and a key pi rejected is left out so the form starts from a valid default.
 */
export type McpTargetRead = {
	readonly transport?: McpTransport;
	readonly command?: string;
	readonly args?: ReadonlyArray<string>;
	readonly cwd?: string;
	readonly url?: string;
	readonly description?: string;
	readonly envKeys: ReadonlyArray<string>;
	readonly headerKeys: ReadonlyArray<string>;
};

export function readTarget(value: JsonValue | undefined): McpTargetRead {
	const raw = rawObject(value);
	const command = raw["command"];
	const url = raw["url"];
	const args = raw["args"];
	const cwd = raw["cwd"];
	const description = raw["description"];
	const transport: McpTransport | undefined =
		typeof url === "string" ? "http" : typeof command === "string" ? "stdio" : undefined;
	const target = {
		envKeys: storedStringKeys(raw["env"]),
		headerKeys: storedStringKeys(raw["headers"]),
	} satisfies McpTargetRead;
	return withDefined(
		withDefined(
			withDefined(
				withDefined(
					withDefined(
						withDefined(target, "transport", transport),
						"command",
						typeof command === "string" ? command : undefined,
					),
					"args",
					Array.isArray(args) && args.every((arg) => typeof arg === "string") ? args : undefined,
				),
				"cwd",
				typeof cwd === "string" ? cwd : undefined,
			),
			"url",
			typeof url === "string" ? url : undefined,
		),
		"description",
		typeof description === "string" ? description : undefined,
	);
}

/** The provider an entry names for `auth`, when it names a usable one. */
export const readAuthProvider = (value: JsonValue | undefined): string | undefined => {
	if (!isJsonObject(value)) return undefined;
	const provider = value["provider"];
	return typeof provider === "string" && provider !== "" ? provider : undefined;
};

/** The tool options an invalid entry still sets with values pi reads. */
export type McpRawSettings = {
	readonly exposure?: McpExposure;
	readonly timeout?: number;
};

export function readRawSettings(value: JsonValue | undefined): McpRawSettings {
	const raw = rawObject(value);
	const exposure = raw["exposure"] === "codemode-deferred" ? "codemode" : raw["exposure"];
	const timeout = raw["timeout"];
	const validExposure =
		exposure === "codemode" ||
		exposure === "deferred" ||
		exposure === "direct" ||
		exposure === "hidden"
			? exposure
			: undefined;
	return withDefined(
		withDefined({} satisfies McpRawSettings, "exposure", validExposure),
		"timeout",
		typeof timeout === "number" && Number.isFinite(timeout) && timeout > 0 ? timeout : undefined,
	);
}

/** The OAuth block as the page may see it: every option, never the secret. */
export type McpOAuthStored = NonNullable<StoredEntry["oauth"]>;

export type McpOAuthRead = {
	readonly oauth?: McpOAuthStored;
	readonly hasSecret: boolean;
};

export function readOAuth(value: JsonValue | undefined): McpOAuthRead {
	if (!isJsonObject(value)) return { hasSecret: false };
	const decoded = Schema.decodeUnknownResult(StoredOAuth)(value);
	if (Result.isFailure(decoded)) return { hasSecret: false };
	return {
		hasSecret: decoded.success.clientSecret !== undefined,
		oauth: decoded.success,
	};
}

/** The per-tool overrides an invalid entry still sets with values pi reads. */
export function readToolExposure(
	value: JsonValue | undefined,
): Readonly<Record<string, McpExposure>> | undefined {
	if (!isJsonObject(value)) return undefined;
	const decoded = Schema.decodeUnknownResult(Schema.Record(Schema.String, StoredExposure))(value);
	if (Result.isFailure(decoded)) return undefined;
	return Object.fromEntries(
		Object.entries(decoded.success).map(([key, exposure]) => [key, normalizeExposure(exposure)]),
	);
}

/** The command line or URL a row shows. */
export function targetOf(entry: McpEntry): string {
	if (entry.url !== undefined) return entry.url;
	return [entry.command ?? "", ...(entry.args ?? [])].join(" ").trim();
}

/** The config pi connects for a project override: the global entry with the override's keys. */
function applyOverride(base: McpEntry, override: McpEntry): McpEntry {
	return withDefined(
		withDefined(withDefined(base, "enabled", override.enabled), "exposure", override.exposure),
		"toolExposure",
		override.toolExposure,
	);
}

/*
 * Then the two files together, in two phases and without mutation.
 *
 * Phase 1 parses every raw entry of both files on its own. Phase 2 resolves what they
 * mean together, in pi's order: every global entry first, then this project's. A project
 * entry that defines a server replaces the global entry of its name; one that only sets
 * override keys changes it. Both stay listed, so the global entry a project replaces is
 * visible instead of hidden behind it.
 */

type ParsedEntry = {
	readonly name: string;
	readonly raw: JsonObject;
	readonly read: McpEntryRead;
	readonly enabled: boolean | undefined;
	readonly rawOverrideKeys: ReadonlyArray<McpOverrideKey> | undefined;
};

const parseFile = (servers: Readonly<Record<string, JsonValue>>): ReadonlyArray<ParsedEntry> =>
	Object.entries(servers).map(([name, value]) => ({
		enabled: rawEnabled(value),
		name,
		raw: rawObject(value),
		rawOverrideKeys: isRawOverride(value) ? rawOverrideKeys(value) : undefined,
		read: readMcpEntry(name, value),
	}));

const invalid = (
	parsed: ParsedEntry,
	scope: McpScope,
	problem: string,
	overrideKeys?: ReadonlyArray<McpOverrideKey>,
): InvalidServer =>
	withDefined(
		{
			enabled: parsed.enabled ?? true,
			kind: "invalid",
			name: parsed.name,
			problem,
			raw: parsed.raw,
			scope,
		} satisfies InvalidServer,
		"overrideKeys",
		overrideKeys,
	);

const clashProblem = (other: string): string =>
	`shares its tool namespace with "${other}", so pi skips it.`;

const resolveGlobals = (
	parsed: ReadonlyArray<ParsedEntry>,
	namespaces: Map<string, string>,
): ReadonlyArray<McpServer> =>
	parsed.map((item): McpServer => {
		const { name, read } = item;
		if (read.kind === "invalid") return invalid(item, "global", read.problem);
		if (read.kind === "override") {
			return invalid(item, "global", 'needs either "command" or "url".');
		}
		const namespace = mcpNamespaceOf(name);
		const clash = namespaces.get(namespace);
		if (clash !== undefined) return invalid(item, "global", clashProblem(clash));
		namespaces.set(namespace, name);
		return {
			config: read.entry,
			kind: "server",
			name,
			scope: "global",
			transport: read.transport,
		};
	});

const resolveProject = (
	parsed: ReadonlyArray<ParsedEntry>,
	globals: ReadonlyMap<string, GlobalServer>,
	namespaces: Map<string, string>,
): ReadonlyArray<McpServer> =>
	parsed.map((item): McpServer => {
		const { name, read } = item;
		if (read.kind === "invalid") {
			return invalid(item, "project", read.problem, item.rawOverrideKeys);
		}
		if (read.kind === "override") {
			const base = globals.get(name);
			if (base === undefined) {
				return invalid(
					item,
					"project",
					"pi needs a global server of this name to override, and the global mcp.json does not define one.",
					read.keys,
				);
			}
			const extra = extraOverrideKeys(item.raw);
			if (extra.length > 0) {
				return invalid(
					item,
					"project",
					`an override can only set ${mcpOverrideKeys.join(", ")}; it also sets ${extra.join(", ")}.`,
					read.keys,
				);
			}
			const config = applyOverride(base.config, read.entry);
			const problem = entryProblem(name, config);
			if (problem !== undefined) return invalid(item, "project", problem, read.keys);
			return withDefined(
				{
					config,
					kind: "override",
					name,
					scope: "project",
					transport: transportOf(config),
					keys: read.keys,
				} satisfies McpServer,
				"enabled",
				read.entry.enabled,
			);
		}
		if (read.entry.url !== undefined && read.entry.auth !== undefined) {
			return invalid(item, "project", "auth is only allowed in the global mcp.json.");
		}
		const namespace = mcpNamespaceOf(name);
		const clash = namespaces.get(namespace);
		if (clash !== undefined && clash !== name) {
			return invalid(item, "project", clashProblem(clash));
		}
		namespaces.set(namespace, name);
		return withDefined(
			{
				config: read.entry,
				kind: "server",
				name,
				scope: "project",
				transport: read.transport,
			} satisfies McpServer,
			"relation",
			globals.has(name) ? ("replaces-global" as const) : undefined,
		);
	});

/** Every entry of both files, with what pi would load. */
export const entriesOf = (
	globalServers: Readonly<Record<string, JsonValue>>,
	projectServers: Readonly<Record<string, JsonValue>>,
): ReadonlyArray<McpServer> => {
	const namespaces = new Map<string, string>();
	const globalEntries = resolveGlobals(parseFile(globalServers), namespaces);
	const globals = new Map<string, GlobalServer>();
	for (const entry of globalEntries) {
		if (entry.kind === "server") globals.set(entry.name, entry);
	}
	const projectEntries = resolveProject(parseFile(projectServers), globals, namespaces);

	const relations = new Map<string, "replaced-by-project" | "overridden-by-project">();
	for (const entry of projectEntries) {
		if (entry.kind === "override") relations.set(entry.name, "overridden-by-project");
		else if (entry.kind === "server" && entry.relation === "replaces-global") {
			relations.set(entry.name, "replaced-by-project");
		}
	}
	const globalsWithRelation = globalEntries.map((entry): McpServer => {
		if (entry.kind !== "server") return entry;
		return withDefined(entry, "relation", relations.get(entry.name));
	});
	return [...globalsWithRelation, ...projectEntries];
};
