/**
 * The pure rules for MCP entries, with no file or SDK access. First one `mcpServers`
 * entry, read the way pi reads it: an entry with `command`,
 * `url` or `type` defines a server; one without them only changes `enabled`,
 * `exposure` and `toolExposure` of the global server of its name.
 *
 * pi exports no validator the dashboard can reach through its package, so the
 * shape lives in one loose zod schema: unknown keys stay on every object. The
 * schema checks types; `entryProblem()` adds the rules pi's validator applies on
 * top (name, transport, a target that exists).
 */
import { z } from "zod";
import type { McpExposure, McpOverrideKey, McpRelation, McpScope, McpTransport } from "shared";
import {
	authProviderProblem,
	mcpExposureSchema,
	mcpExposuresOf,
	mcpNamespaceOf,
	mcpOAuthSchema,
	oauthProblem,
} from "shared";

/** The only keys a project entry may set when it overrides a global server. */
const MCP_OVERRIDE_KEYS: readonly McpOverrideKey[] = ["enabled", "exposure", "toolExposure"];

/** `codemode-deferred` is the name pi used before; it still reads it as `codemode`. */
const storedExposureSchema = z
	.union([mcpExposureSchema, z.literal("codemode-deferred")])
	.transform((value): McpExposure => (value === "codemode-deferred" ? "codemode" : value));

/** OAuth options pi resolves before it connects; the rules are shared with the form. */
const oauthSchema = mcpOAuthSchema;

/** A `/login` provider whose token an HTTP server may send instead of using OAuth. */
const authSchema = z.looseObject({ provider: z.string().min(1) });

/** One server entry of either transport. Unknown keys are kept by `looseObject`. */
const mcpEntrySchema = z.looseObject({
	type: z.enum(["stdio", "http", "streamable-http", "sse"]).optional(),
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
	env: z.record(z.string(), z.string()).optional(),
	cwd: z.string().optional(),
	url: z.string().optional(),
	headers: z.record(z.string(), z.string()).optional(),
	oauth: oauthSchema.optional(),
	auth: authSchema.optional(),
	exposure: storedExposureSchema.optional(),
	toolExposure: z.record(z.string(), storedExposureSchema).optional(),
	enabled: z.boolean().optional(),
	description: z.string().optional(),
	timeout: z.number().positive().optional(),
});

export type McpEntry = z.infer<typeof mcpEntrySchema>;

/** Any JSON value, which is what one `mcpServers` member holds before parsing. */
const jsonSchema = z.json();

export type McpRawEntry = z.infer<typeof jsonSchema>;

/** One entry's JSON object, kept exactly as the file holds it. */
const rawEntrySchema = z.record(z.string(), jsonSchema);

export type McpRawObject = z.infer<typeof rawEntrySchema>;

export const isRecord = (value: McpRawEntry): value is McpRawObject =>
	rawEntrySchema.safeParse(value).success;

/** One entry's record, or an empty one when the value is not an object. */
export const readRawObject = (value: McpRawEntry | undefined): McpRawObject => {
	const parsed = rawEntrySchema.safeParse(value);
	return parsed.success ? parsed.data : rawEntrySchema.parse({});
};

const stringMapSchema = z.record(z.string(), z.string());

/** A stored map of strings, which is what `env` and `headers` may hold. */
export const stringMapOf = (value: McpRawEntry | undefined) => {
	const parsed = stringMapSchema.safeParse(value);
	return parsed.success ? parsed.data : stringMapSchema.parse({});
};

const booleanSchema = z.boolean();

/** The entry's own `enabled`, when it holds a boolean, so an invalid entry still shows its state. */
const rawEnabled = (value: McpRawEntry | undefined): boolean | undefined => {
	const object = rawEntrySchema.safeParse(value);
	if (!object.success) return undefined;
	const parsed = booleanSchema.safeParse(object.data.enabled);
	return parsed.success ? parsed.data : undefined;
};

/** The override keys the raw object sets, read even when the entry is otherwise invalid. */
const rawOverrideKeys = (value: McpRawEntry): McpOverrideKey[] => {
	const object = rawEntrySchema.safeParse(value);
	if (!object.success) return [];
	return MCP_OVERRIDE_KEYS.filter((key) => object.data[key] !== undefined);
};

/** Whether an entry only overrides a server, read from the raw object, not its validity. */
export const isRawOverride = (value: McpRawEntry): boolean => {
	const object = rawEntrySchema.safeParse(value);
	if (!object.success) return false;
	return (
		object.data.command === undefined &&
		object.data.url === undefined &&
		object.data.type === undefined
	);
};

/** One entry as pi would read it. */
export type McpEntryRead =
	| { kind: "invalid"; problem: string }
	| { kind: "override"; entry: McpEntry; keys: McpOverrideKey[] }
	| { kind: "server"; entry: McpEntry; transport: McpTransport };

const issueText = (error: z.ZodError): string => {
	const issue = error.issues.at(0);
	if (issue === undefined) return "pi skips this entry.";
	const path = issue.path.join(".");
	if (path === "exposure" || issue.path[0] === "toolExposure") {
		return `${path} must be codemode, deferred, direct or hidden.`;
	}
	return path === "" ? issue.message : `${path}: ${issue.message}`;
};

/** The keys an override sets, in pi's order. */
const overrideKeysOf = (entry: McpEntry): McpOverrideKey[] => {
	const keys: McpOverrideKey[] = [];
	if (entry.enabled !== undefined) keys.push("enabled");
	if (entry.exposure !== undefined) keys.push("exposure");
	if (entry.toolExposure !== undefined) keys.push("toolExposure");
	return keys;
};

/** The keys pi refuses in an override because they would define a new server. */
const extraOverrideKeys = (entry: McpEntry): string[] =>
	Object.keys(entry).filter((key) => !MCP_OVERRIDE_KEYS.some((allowed) => allowed === key));

/** Whether the entry defines a server (`false` means it is an override). */
const definesServer = (entry: McpEntry): boolean =>
	entry.command !== undefined || entry.url !== undefined || entry.type !== undefined;

const isHttpUrl = (url: string): boolean => {
	try {
		return ["http:", "https:"].includes(new URL(url).protocol);
	} catch {
		return false;
	}
};

/** The transport pi's own transport factory uses: any `url` string is HTTP. */
const transportOf = (entry: McpEntry): McpTransport => (entry.url === undefined ? "stdio" : "http");

/** The command line or URL a row shows. */
export function targetOf(entry: McpEntry): string {
	if (entry.url !== undefined) return entry.url;
	return [entry.command ?? "", ...(entry.args ?? [])].join(" ").trim();
}

/**
 * The rules pi's validator applies on top of the schema: a valid server name, no
 * legacy SSE, a target that exists, an http(s) URL, and the `oauth` and `auth`
 * options pi will only send over https or to this machine. Everything else
 * (types, exposures, a positive timeout) is the schema's.
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
	if (http && entry.url !== undefined) {
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

/** Parse one `mcpServers` value the way pi reads it, and say what it is. */
export function readMcpEntry(name: string, value: McpRawEntry): McpEntryRead {
	const object = rawEntrySchema.safeParse(value);
	if (!object.success) {
		return { kind: "invalid", problem: "pi skips an entry that is not an object." };
	}
	const parsed = mcpEntrySchema.safeParse(object.data);
	if (!parsed.success) return { kind: "invalid", problem: issueText(parsed.error) };
	const entry = parsed.data;
	if (!definesServer(entry)) {
		return { kind: "override", entry, keys: overrideKeysOf(entry) };
	}
	const problem = entryProblem(name, entry);
	if (problem !== undefined) return { kind: "invalid", problem };
	return { kind: "server", entry, transport: transportOf(entry) };
}

/**
 * The keys of a stored map whose value is a string. One bad value hides one name
 * rather than the whole map, which is what a repair needs to see.
 */
const storedStringKeys = (value: McpRawEntry | undefined): string[] => {
	const parsed = z.record(z.string(), jsonSchema).safeParse(value);
	if (!parsed.success) return [];
	return Object.entries(parsed.data).flatMap(([key, entry]) =>
		z.string().safeParse(entry).success ? [key] : [],
	);
};

/**
 * What an entry pi skips still says about its target, so the form can prefill a
 * repair instead of starting from the name alone. A value is kept only when it
 * has the type its field needs, and a key pi rejected (a bad `exposure`, say) is
 * left out so the form starts from a valid default for it. `env` and `headers`
 * contribute their names, never a stored value.
 */
export type McpTargetRead = {
	transport?: McpTransport;
	command?: string;
	args?: string[];
	cwd?: string;
	url?: string;
	description?: string;
	envKeys: string[];
	headerKeys: string[];
};

export function readTarget(value: McpRawEntry): McpTargetRead {
	const raw = readRawObject(value);
	const command = z.string().safeParse(raw.command);
	const url = z.string().safeParse(raw.url);
	const args = z.array(z.string()).safeParse(raw.args);
	const cwd = z.string().safeParse(raw.cwd);
	const description = z.string().safeParse(raw.description);
	const target: McpTargetRead = {
		envKeys: storedStringKeys(raw.env),
		headerKeys: storedStringKeys(raw.headers),
	};
	if (url.success) target.transport = "http";
	else if (command.success) target.transport = "stdio";
	if (command.success) target.command = command.data;
	if (args.success) target.args = args.data;
	if (cwd.success) target.cwd = cwd.data;
	if (url.success) target.url = url.data;
	if (description.success) target.description = description.data;
	return target;
}

/** The provider an entry names for `auth`, when it names a usable one. */
export const readAuthProvider = (value: McpRawEntry | undefined): string | undefined => {
	const parsed = authSchema.safeParse(value);
	return parsed.success ? parsed.data.provider : undefined;
};

/**
 * The tool options an invalid entry still sets with values pi reads: a repair
 * keeps them instead of resetting what broke for another reason. A value pi
 * rejects is left out, so the form starts from a valid default for it.
 */
export type McpRawSettings = { exposure?: McpExposure; timeout?: number };

export function readRawSettings(value: McpRawEntry): McpRawSettings {
	const raw = readRawObject(value);
	const settings: McpRawSettings = {};
	const exposure = storedExposureSchema.safeParse(raw.exposure);
	if (exposure.success) settings.exposure = exposure.data;
	const timeout = z.number().positive().safeParse(raw.timeout);
	if (timeout.success) settings.timeout = timeout.data;
	return settings;
}

/** The exposures of one config that only codemode or `tool_search` can reach. */
export const indirectExposuresOf = (config: McpEntry): McpExposure[] =>
	mcpExposuresOf(config).filter((exposure) => exposure === "codemode" || exposure === "deferred");

/** The config pi connects for a project override: the global entry with the override's keys. */
function applyOverride(base: McpEntry, override: McpEntry): McpEntry {
	const merged = { ...base };
	if (override.enabled !== undefined) merged.enabled = override.enabled;
	if (override.exposure !== undefined) merged.exposure = override.exposure;
	if (override.toolExposure !== undefined) merged.toolExposure = override.toolExposure;
	return merged;
}

/*
 * Then the two files together, in two phases and without mutation.
 *
 * Phase 1 parses every raw entry of both files on its own (`parseFile`). Phase 2
 * resolves what they mean together, in pi's order: every global entry first, then
 * this project's. A project entry that defines a server replaces the global entry
 * of its name; one that only sets override keys changes it. Both stay listed, so
 * the global entry a project replaces is visible instead of hidden behind it.
 */

/** One entry of either file, as the server list and detail show it. */
export type McpServer =
	| {
			kind: "server";
			name: string;
			scope: McpScope;
			/** What pi connects. */
			config: McpEntry;
			transport: McpTransport;
			/** How the other file's entry of this name relates to this one, when one does. */
			relation?: McpRelation;
	  }
	| {
			/** A project entry that only changes keys of the global server of its name. */
			kind: "override";
			name: string;
			scope: "project";
			/** The global server's config with the override applied: what pi connects. */
			config: McpEntry;
			transport: McpTransport;
			keys: McpOverrideKey[];
			/** What the override sets `enabled` to, when it sets it. */
			enabled?: boolean;
	  }
	| {
			/** pi skips this entry. `overrideKeys` is set when it was meant as an override. */
			kind: "invalid";
			name: string;
			scope: McpScope;
			problem: string;
			/** The entry's own `enabled`, so a row still shows Off while pi skips it. */
			enabled: boolean;
			overrideKeys?: McpOverrideKey[];
			/** The file's object, so the form can prefill a repair from what pi can still read. */
			raw: McpRawObject;
	  };

type GlobalServer = Extract<McpServer, { kind: "server" }>;
type InvalidServer = Extract<McpServer, { kind: "invalid" }>;

/** Phase 1: one entry read on its own, plus the raw facts an invalid entry still shows. */
interface ParsedEntry {
	name: string;
	raw: McpRawObject;
	read: McpEntryRead;
	enabled: boolean | undefined;
	/** The override keys the raw object sets, when it has no command, url or type. */
	rawOverrideKeys: McpOverrideKey[] | undefined;
}

const parseFile = (servers: Record<string, McpRawEntry>): ParsedEntry[] =>
	Object.entries(servers).map(([name, value]) => ({
		name,
		raw: readRawObject(value),
		read: readMcpEntry(name, value),
		enabled: rawEnabled(value),
		rawOverrideKeys: isRawOverride(value) ? rawOverrideKeys(value) : undefined,
	}));

/** Names that differ only in `-` and `_` would share pi's tool namespace. */
const namespaceOf = mcpNamespaceOf;

const invalid = (
	parsed: ParsedEntry,
	scope: McpScope,
	problem: string,
	overrideKeys?: McpOverrideKey[],
): InvalidServer => ({
	kind: "invalid",
	name: parsed.name,
	scope,
	problem,
	enabled: parsed.enabled ?? true,
	overrideKeys,
	raw: parsed.raw,
});

const clashProblem = (other: string): string =>
	`shares its tool namespace with "${other}", so pi skips it.`;

const resolveGlobals = (parsed: ParsedEntry[], namespaces: Map<string, string>): McpServer[] =>
	parsed.map((item): McpServer => {
		const { name, read } = item;
		if (read.kind === "invalid") return invalid(item, "global", read.problem);
		if (read.kind === "override") {
			return invalid(item, "global", 'needs either "command" or "url".');
		}
		const namespace = namespaceOf(name);
		const clash = namespaces.get(namespace);
		if (clash !== undefined) return invalid(item, "global", clashProblem(clash));
		namespaces.set(namespace, name);
		return {
			kind: "server",
			name,
			scope: "global",
			config: read.entry,
			transport: read.transport,
		};
	});

const resolveProject = (
	parsed: ParsedEntry[],
	globals: ReadonlyMap<string, GlobalServer>,
	namespaces: Map<string, string>,
): McpServer[] =>
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
			const extra = extraOverrideKeys(read.entry);
			if (extra.length > 0) {
				return invalid(
					item,
					"project",
					`an override can only set ${MCP_OVERRIDE_KEYS.join(", ")}; it also sets ${extra.join(", ")}.`,
					read.keys,
				);
			}
			const config = applyOverride(base.config, read.entry);
			const problem = entryProblem(name, config);
			if (problem !== undefined) return invalid(item, "project", problem, read.keys);
			return {
				kind: "override",
				name,
				scope: "project",
				config,
				transport: transportOf(config),
				keys: read.keys,
				enabled: read.entry.enabled,
			};
		}
		if (read.entry.url !== undefined && read.entry.auth !== undefined) {
			return invalid(item, "project", "auth is only allowed in the global mcp.json.");
		}
		const namespace = namespaceOf(name);
		const clash = namespaces.get(namespace);
		if (clash !== undefined && clash !== name) {
			return invalid(item, "project", clashProblem(clash));
		}
		namespaces.set(namespace, name);
		return {
			kind: "server",
			name,
			scope: "project",
			config: read.entry,
			transport: read.transport,
			relation: globals.has(name) ? "replaces-global" : undefined,
		};
	});

/** Every entry of both files, with what pi would load. */
export const entriesOf = (
	globalServers: Record<string, McpRawEntry>,
	projectServers: Record<string, McpRawEntry>,
): McpServer[] => {
	const namespaces = new Map<string, string>();
	const globalEntries = resolveGlobals(parseFile(globalServers), namespaces);
	const globals = new Map<string, GlobalServer>();
	for (const entry of globalEntries) {
		if (entry.kind === "server") globals.set(entry.name, entry);
	}
	const projectEntries = resolveProject(parseFile(projectServers), globals, namespaces);

	const relations = new Map<string, McpRelation>();
	for (const entry of projectEntries) {
		if (entry.kind === "override") relations.set(entry.name, "overridden-by-project");
		else if (entry.kind === "server" && entry.relation === "replaces-global") {
			relations.set(entry.name, "replaced-by-project");
		}
	}
	const globalsWithRelation = globalEntries.map((entry): McpServer => {
		if (entry.kind !== "server") return entry;
		const relation = relations.get(entry.name);
		return relation === undefined ? entry : { ...entry, relation };
	});
	return [...globalsWithRelation, ...projectEntries];
};
