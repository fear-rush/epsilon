import { Context, Effect, Layer, Result, Schema } from "effect";

import { McpRefused } from "#protocol/errors";
import type {
	McpInProjectValue,
	McpInvalidEntry,
	McpLive,
	McpListView,
	McpOAuthInput,
	McpOAuthView,
	McpOverrideEntry,
	McpScope,
	McpServerDetail,
	McpServerDetailEntry,
	McpServerDetailInvalid,
	McpServerEntry,
	McpServerInput,
	McpServerRow,
	McpToolExposure,
} from "#protocol/settings/mcp";

import {
	authProviderProblem,
	indirectExposuresOf,
	isHttpUrl,
	isMcpName,
	oauthProblem,
} from "../../../domain/mcp/rules.ts";
import { withDefined } from "../../../domain/object.ts";
import { Engines } from "../../conversation/registry.ts";
import { Log } from "../../platform/log.ts";
import { isJsonObject, isJsonValue, setDefined, setOrDelete } from "../../platform/patch.ts";
import type { JsonObject, JsonValue } from "../../platform/patch.ts";
import {
	entriesOf,
	isRawOverride,
	projectEntryProblem,
	readAuthProvider,
	readMcpEntry,
	readOAuth,
	readRawObject,
	readRawSettings,
	readTarget,
	readToolExposure,
	stringMapOf,
	targetOf,
} from "./entries.ts";
import type { McpEntry, McpOAuthStored, McpServer } from "./entries.ts";
import { mcpLiveReader } from "./live.ts";
import { McpStore } from "./store.ts";
import type { McpStoreApi } from "./store.ts";

/**
 * Settings → MCP: what both `mcp.json` files say, and every write to them.
 *
 * A read resolves the two files the way pi does, so the page cannot list a server pi
 * skips or hide one pi loads. A write is a locked read-modify-write that keeps unknown
 * keys, never replaces a file it cannot parse, and runs the result back through pi's own
 * rules: a save either produces an entry pi loads or is refused with the reason.
 *
 * `enabled` is the switch's to write, never a form save: `false` writes the key and
 * `true` removes it, as pi's own writer does, except on an override, which keeps the
 * value written because it replaces the global entry's.
 */

/** The service owns its file access; callers see only the feature's errors. */
type Io<A, E = never> = Effect.Effect<A, E>;

export type McpServiceApi = {
	readonly list: (folder: string | null) => Io<McpListView>;
	readonly live: (folder: string | null) => Io<McpLive>;
	readonly read: (
		folder: string | null,
		scope: McpScope,
		name: string,
	) => Io<McpServerDetail, McpRefused>;
	readonly save: (folder: string | null, input: McpServerInput) => Io<void, McpRefused>;
	readonly remove: (folder: string | null, scope: McpScope, name: string) => Io<void, McpRefused>;
	readonly setEnabled: (
		folder: string | null,
		scope: McpScope,
		name: string,
		enabled: boolean,
	) => Io<void, McpRefused>;
	readonly setInProject: (
		folder: string | null,
		name: string,
		value: McpInProjectValue,
	) => Io<void, McpRefused>;
	readonly setAutoEnableCodemode: (
		folder: string | null,
		scope: McpScope,
		enabled: boolean,
	) => Io<void, McpRefused>;
	readonly readRaw: (
		folder: string | null,
		scope: McpScope,
		name: string,
	) => Io<string, McpRefused>;
	readonly writeRaw: (
		folder: string | null,
		scope: McpScope,
		name: string,
		text: string,
	) => Io<void, McpRefused>;
};

export class McpService extends Context.Service<McpService, McpServiceApi>()(
	"epsilon/McpService",
) {}

const refusal = (subject: string | undefined, reason: string): McpRefused =>
	new McpRefused(subject === undefined ? { reason } : { reason, subject });

const requireProject = (folder: string | null, what: string): Effect.Effect<string, McpRefused> =>
	folder === null
		? Effect.fail(refusal(undefined, `Choose a project before ${what}.`))
		: Effect.succeed(folder);

const fileLabel = (scope: McpScope): string =>
	scope === "global" ? "the global mcp.json" : "this project's .pi/mcp.json";

/** The target fields a detail shows, and the names of every stored value. */
const targetDetail = (entry: McpEntry) =>
	withDefined(
		withDefined(
			withDefined(
				withDefined(
					{
						envKeys: Object.keys(stringMapOf(entry.env)),
						headerKeys: Object.keys(stringMapOf(entry.headers)),
					},
					"command",
					entry.command,
				),
				"args",
				entry.args,
			),
			"cwd",
			entry.cwd,
		),
		"url",
		entry.url,
	);

/** The OAuth block without the secret, which never leaves the server. */
const oauthViewOf = (oauth: McpOAuthStored): McpOAuthView => {
	const { clientSecret: _secret, ...view } = oauth;
	return view;
};

/** What a row shows of an entry pi can connect; an unset key is absent, not null. */
const connectableFields = (entry: Extract<McpServer, { kind: "server" | "override" }>) => {
	const config = entry.config;
	return withDefined(
		withDefined(
			withDefined(
				{
					name: entry.name,
					target: targetOf(config),
					transport: entry.transport,
					enabled: config.enabled !== false,
					needsIndirect: indirectExposuresOf(config).length > 0,
				},
				"description",
				config.description,
			),
			"exposure",
			config.exposure,
		),
		"timeout",
		config.timeout,
	);
};

const serverRow = (entry: Extract<McpServer, { kind: "server" }>): McpServerEntry =>
	withDefined(
		{
			kind: "server",
			scope: entry.scope,
			...connectableFields(entry),
		} satisfies McpServerEntry,
		"relation",
		entry.relation,
	);

const overrideRow = (entry: Extract<McpServer, { kind: "override" }>): McpOverrideEntry =>
	withDefined(
		{
			kind: "override",
			scope: "project",
			...connectableFields(entry),
			overrideKeys: entry.keys,
		} satisfies McpOverrideEntry,
		"overrideEnabled",
		entry.enabled,
	);

const invalidRow = (entry: Extract<McpServer, { kind: "invalid" }>): McpInvalidEntry =>
	withDefined(
		{
			kind: "invalid",
			name: entry.name,
			scope: entry.scope,
			problem: entry.problem,
			enabled: entry.enabled,
		} satisfies McpInvalidEntry,
		"overrideKeys",
		entry.overrideKeys,
	);

const toRow = (entry: McpServer): McpServerRow => {
	if (entry.kind === "override") return overrideRow(entry);
	if (entry.kind === "invalid") return invalidRow(entry);
	return serverRow(entry);
};

const detailOf = (entry: McpServer): McpServerDetail => {
	if (entry.kind === "override") return overrideRow(entry);
	if (entry.kind === "invalid") {
		const raw = entry.raw;
		const oauth = readOAuth(raw["oauth"]);
		const oauthEntry = oauth.oauth;
		const usable = oauthEntry !== undefined && oauthProblem(oauthEntry) === undefined;
		const base = {
			...invalidRow(entry),
			...readTarget(raw),
			...readRawSettings(raw),
			oauthClientSecret: oauth.hasSecret,
		} satisfies McpServerDetailInvalid;
		return withDefined(
			withDefined(
				withDefined(base, "toolExposure", readToolExposure(raw["toolExposure"])),
				"oauth",
				usable ? oauthViewOf(oauthEntry) : undefined,
			),
			"authProvider",
			readAuthProvider(raw["auth"]),
		);
	}
	const config = entry.config;
	const base = {
		kind: "server",
		scope: entry.scope,
		...connectableFields(entry),
		...targetDetail(config),
		oauthClientSecret: config.oauth?.clientSecret !== undefined,
		// Filled by `read` once the two files a connection leaves behind are read.
		credentialsStored: false,
		log: [],
	} satisfies McpServerDetailEntry;
	return withDefined(
		withDefined(
			withDefined(
				withDefined(base, "relation", entry.relation),
				"toolExposure",
				config.toolExposure,
			),
			"oauth",
			config.oauth === undefined ? undefined : oauthViewOf(config.oauth),
		),
		"authProvider",
		config.auth?.provider,
	);
};

/** One file's raw servers, refusing a `mcpServers` this write cannot understand. */
const serversOf = (
	document: JsonObject,
	scope: McpScope,
): Effect.Effect<JsonObject, McpRefused> => {
	const servers = document["mcpServers"];
	if (servers === undefined) return Effect.succeed({});
	if (!isJsonObject(servers)) {
		return Effect.fail(
			refusal(
				undefined,
				`${fileLabel(scope)}: "mcpServers" is not an object, so it cannot be edited.`,
			),
		);
	}
	return Effect.succeed(servers);
};

/** A value the browser may not see, replaced by this sentinel in the raw text. */
const STORED = "<stored>";

/** The `oauth` keys the detail shows; every other one is hidden like a secret. */
const shownOAuthKeys = new Set([
	"clientId",
	"callbackPort",
	"callbackUrl",
	"scope",
	"clientName",
	"clientRegistration",
	"authServerMetadataUrl",
]);

const hideValues = (value: JsonValue | undefined): JsonValue | undefined =>
	isJsonObject(value) ? Object.fromEntries(Object.keys(value).map((key) => [key, STORED])) : value;

const hideOAuth = (value: JsonValue | undefined): JsonValue | undefined =>
	isJsonObject(value)
		? Object.fromEntries(
				Object.entries(value).map(([key, entry]) => [
					key,
					shownOAuthKeys.has(key) ? entry : STORED,
				]),
			)
		: value;

/** The entry with `env`, `headers` and `oauth` secrets hidden. */
const redactEntry = (entry: JsonObject): JsonObject => {
	const next = { ...entry };
	if (next["env"] !== undefined) setDefined(next, "env", hideValues(next["env"]));
	if (next["headers"] !== undefined) setDefined(next, "headers", hideValues(next["headers"]));
	if (next["oauth"] !== undefined) setDefined(next, "oauth", hideOAuth(next["oauth"]));
	return next;
};

/** Put the stored value back wherever `incoming` holds the sentinel. */
const restoreStored = (
	incoming: JsonValue,
	stored: JsonValue | undefined,
	path: ReadonlyArray<string>,
): Effect.Effect<JsonValue, McpRefused> => {
	if (incoming === STORED) {
		return stored === undefined
			? Effect.fail(
					refusal(undefined, `"${path.join(".")}" has no stored value to keep; type a value.`),
				)
			: Effect.succeed(stored);
	}
	if (Array.isArray(incoming)) {
		return Effect.forEach(
			incoming,
			(item, index) =>
				restoreStored(item, Array.isArray(stored) ? stored[index] : undefined, [
					...path,
					String(index),
				]),
			{ concurrency: 1 },
		);
	}
	if (isJsonObject(incoming)) {
		const storedMap = isJsonObject(stored) ? stored : {};
		return Effect.gen(function* () {
			const next: JsonObject = {};
			for (const [key, value] of Object.entries(incoming)) {
				next[key] = yield* restoreStored(value, storedMap[key], [...path, key]);
			}
			return next;
		});
	}
	return Effect.succeed(incoming);
};

/** pi's rules for a finished entry, so a write cannot store what pi would skip. */
const checkEntry = (
	name: string,
	next: JsonObject,
	scope: McpScope,
	allowOverride = false,
): Effect.Effect<void, McpRefused> => {
	const read = readMcpEntry(name, next);
	if (read.kind === "invalid") {
		return Effect.fail(refusal(name, `${read.problem} Fix that key in ${fileLabel(scope)}.`));
	}
	if (read.kind === "override") {
		if (allowOverride && scope === "project") return Effect.void;
		return Effect.fail(refusal(name, `pi would read "${name}" as an override, not a server.`));
	}
	if (scope === "project") {
		const problem = projectEntryProblem(read.entry);
		if (problem !== undefined) return Effect.fail(refusal(name, problem));
	}
	return Effect.void;
};

/**
 * A blank value for a stored name keeps the stored one; names left out are removed.
 * `undefined` means the whole map is absent, so the caller deletes the key.
 */
const mergeSecrets = (
	incoming: Readonly<Record<string, string>> | undefined,
	stored: Readonly<Record<string, string>>,
	name: string,
): Effect.Effect<Readonly<Record<string, string>> | undefined, McpRefused> =>
	Effect.gen(function* () {
		if (incoming === undefined) return undefined;
		const merged: Record<string, string> = {};
		for (const [key, value] of Object.entries(incoming)) {
			const kept = stored[key];
			if (value === "") {
				if (kept === undefined) {
					return yield* refusal(name, `Add a value for "${key}", or remove the row.`);
				}
				merged[key] = kept;
			} else merged[key] = value;
		}
		return Object.keys(merged).length === 0 ? undefined : merged;
	});

/** The OAuth block to write: a blank option removes it, a blank secret keeps the stored one. */
const oauthToWrite = (input: McpOAuthInput, stored: JsonObject): JsonObject => {
	const next: JsonObject = { ...stored };
	const put = (key: string, value: string | number | undefined): void => {
		if (value === undefined || value === "") delete next[key];
		else next[key] = value;
	};
	put("clientId", input.clientId);
	put("callbackPort", input.callbackPort);
	put("callbackUrl", input.callbackUrl);
	put("scope", input.scope);
	put("clientName", input.clientName);
	put("clientRegistration", input.clientRegistration);
	put("authServerMetadataUrl", input.authServerMetadataUrl);
	if (input.clientSecret !== undefined && input.clientSecret !== "") {
		next["clientSecret"] = input.clientSecret;
	}
	return next;
};

const checkToolExposure = (
	toolExposure: McpToolExposure | undefined,
	name: string,
): Effect.Effect<void, McpRefused> => {
	if (toolExposure === undefined) return Effect.void;
	for (const pattern of Object.keys(toolExposure)) {
		if (pattern === "") {
			return Effect.fail(refusal(name, "A per-tool rule needs a tool name or a pattern."));
		}
	}
	return Effect.void;
};

/** The target folder a write uses; a global write never touches a project. */
const folderFor = (
	folder: string | null,
	scope: McpScope,
	what: string,
): Effect.Effect<string, McpRefused> =>
	scope === "project" ? requireProject(folder, what) : Effect.succeed(folder ?? "");

export const makeMcpService = (deps: {
	readonly store: McpStoreApi;
	readonly live: (names: ReadonlyArray<string>) => Effect.Effect<McpLive>;
}): McpServiceApi => {
	const editFile = Effect.fn("Mcp.editFile")(function* (
		scope: McpScope,
		folder: string,
		change: (document: JsonObject) => Effect.Effect<JsonObject, McpRefused>,
	) {
		return yield* deps.store.edit(scope, folder, change).pipe(
			Effect.catchTags({
				FileUnreadable: (error) =>
					Effect.fail(refusal(undefined, `${error.path} could not be read: ${error.reason}`)),
				FileUnwritable: (error) =>
					Effect.fail(refusal(undefined, `${error.path} could not be written: ${error.reason}`)),
				Locked: (error) =>
					Effect.fail(refusal(undefined, `${error.path} is locked by another writer.`)),
				NotJson: (error) =>
					Effect.fail(refusal(undefined, `${error.path} is not valid JSON: ${error.reason}`)),
			}),
		);
	});

	const readFiles = Effect.fn("Mcp.readFiles")(function* (folder: string | null) {
		const global = yield* deps.store.read("global", folder ?? "");
		const project = folder === null ? undefined : yield* deps.store.read("project", folder);
		const problems = [global.problem, project?.problem].filter(
			(problem): problem is string => problem !== undefined,
		);
		return {
			entries: entriesOf(global.servers, project === undefined ? {} : project.servers),
			problems,
		};
	});

	const list: McpServiceApi["list"] = Effect.fn("Mcp.list")(function* (folder) {
		const { entries, problems } = yield* readFiles(folder);
		const servers = entries
			.map(toRow)
			.toSorted((left, right) =>
				left.scope === right.scope
					? left.name.localeCompare(right.name)
					: left.scope === "project"
						? -1
						: 1,
			);
		return { problems, servers };
	});

	const live: McpServiceApi["live"] = Effect.fn("Mcp.live")(function* (folder) {
		const { entries } = yield* readFiles(folder);
		return yield* deps.live(entries.map((entry) => entry.name));
	});

	const read: McpServiceApi["read"] = Effect.fn("Mcp.read")(function* (folder, scope, name) {
		const { entries } = yield* readFiles(folder);
		const entry = entries.find((candidate) => candidate.scope === scope && candidate.name === name);
		if (entry === undefined) {
			return yield* refusal(name, `The ${scope} mcp.json does not define "${name}".`);
		}
		const detail = detailOf(entry);
		if (detail.kind !== "server") return detail;
		const [log, credentialsStored] = yield* Effect.all(
			[deps.store.logTail(name), deps.store.hasCredentials(name, detail.url)] as const,
			{ concurrency: 2 },
		);
		return { ...detail, credentialsStored, log };
	});

	const save: McpServiceApi["save"] = Effect.fn("Mcp.save")(function* (folder, input) {
		if (!isMcpName(input.name)) {
			return yield* refusal(
				input.name,
				"A server name may only use letters, digits, dashes and underscores.",
			);
		}
		const targetFolder = yield* folderFor(folder, input.scope, "saving a project's .pi/mcp.json");
		if (input.timeout !== undefined && !(input.timeout > 0)) {
			return yield* refusal(input.name, "timeout must be a positive number of seconds.");
		}
		yield* checkToolExposure(input.toolExposure, input.name);
		if (input.transport === "http") {
			if (!isHttpUrl(input.url)) {
				return yield* refusal(input.name, "url must be an http or https URL.");
			}
			if (input.oauth !== undefined) {
				const problem = oauthProblem(input.oauth);
				if (problem !== undefined) return yield* refusal(input.name, problem);
			}
			const provider =
				input.authProvider === undefined || input.authProvider === ""
					? undefined
					: input.authProvider;
			if (provider !== undefined) {
				if (input.scope === "project") {
					return yield* refusal(input.name, "auth is only allowed in the global mcp.json.");
				}
				const problem = authProviderProblem(input.url);
				if (problem !== undefined) return yield* refusal(input.name, problem);
			}
		} else if (input.command === "") {
			return yield* refusal(input.name, "A stdio server needs a command.");
		}

		yield* editFile(input.scope, targetFolder, (document) =>
			Effect.gen(function* () {
				const servers = yield* serversOf(document, input.scope);
				const existing = servers[input.name];
				if (existing !== undefined && !isJsonObject(existing)) {
					return yield* refusal(
						input.name,
						`"${input.name}" is not an object in this file; remove it there before editing here.`,
					);
				}
				if (input.scope === "project" && isRawOverride(existing)) {
					return yield* refusal(
						input.name,
						`"${input.name}" in this project only overrides a global server. Change that server, or remove the override.`,
					);
				}
				const next: JsonObject = { ...readRawObject(existing) };
				// The transport decides which target exists; `type` is optional, so leaving
				// it out cannot disagree with the target we write.
				delete next["type"];
				setOrDelete(next, "description", input.description);
				// `codemode` is pi's default, so it is written by removing the key.
				setOrDelete(next, "exposure", input.exposure === "codemode" ? undefined : input.exposure);
				setDefined(next, "timeout", input.timeout);
				setOrDelete(next, "toolExposure", input.toolExposure ?? {});

				if (input.transport === "stdio") {
					delete next["url"];
					delete next["headers"];
					delete next["oauth"];
					delete next["auth"];
					next["command"] = input.command;
					setOrDelete(next, "args", input.args === undefined ? undefined : [...input.args]);
					setOrDelete(next, "cwd", input.cwd);
					const env = yield* mergeSecrets(input.env, stringMapOf(next["env"]), input.name);
					if (env === undefined) delete next["env"];
					else next["env"] = env;
				} else {
					delete next["command"];
					delete next["args"];
					delete next["env"];
					delete next["cwd"];
					next["url"] = input.url;
					const storedHeaders = stringMapOf(next["headers"]);
					const headers = yield* mergeSecrets(input.headers, storedHeaders, input.name);
					if (headers === undefined) delete next["headers"];
					else next["headers"] = headers;
					const storedOAuth = isJsonObject(next["oauth"]) ? next["oauth"] : {};
					if (input.oauth === undefined) delete next["oauth"];
					else next["oauth"] = oauthToWrite(input.oauth, storedOAuth);
					const provider =
						input.authProvider === undefined || input.authProvider === ""
							? undefined
							: input.authProvider;
					if (input.scope === "project" || provider === undefined) delete next["auth"];
					else next["auth"] = { provider };
				}

				yield* checkEntry(input.name, next, input.scope);
				return { ...document, mcpServers: { ...servers, [input.name]: next } };
			}),
		);
		return undefined;
	});

	const remove: McpServiceApi["remove"] = Effect.fn("Mcp.remove")(function* (folder, scope, name) {
		const targetFolder = yield* folderFor(folder, scope, "removing a project server");
		yield* editFile(scope, targetFolder, (document) =>
			Effect.gen(function* () {
				const servers = yield* serversOf(document, scope);
				if (servers[name] === undefined) {
					return yield* refusal(name, `mcp.json does not define "${name}" any more.`);
				}
				const next = { ...servers };
				delete next[name];
				return { ...document, mcpServers: next };
			}),
		);
		return undefined;
	});

	const setEnabled: McpServiceApi["setEnabled"] = Effect.fn("Mcp.setEnabled")(
		function* (folder, scope, name, enabled) {
			const targetFolder = yield* folderFor(folder, scope, "changing a project server");
			yield* editFile(scope, targetFolder, (document) =>
				Effect.gen(function* () {
					const servers = yield* serversOf(document, scope);
					const existing = servers[name];
					if (existing === undefined) {
						return yield* refusal(name, `mcp.json does not define "${name}" any more.`);
					}
					if (!isJsonObject(existing)) {
						return yield* refusal(
							name,
							`"${name}" is not an object, so it cannot be turned on or off.`,
						);
					}
					const next = { ...existing };
					if (enabled && !isRawOverride(existing)) delete next["enabled"];
					else next["enabled"] = enabled;
					return { ...document, mcpServers: { ...servers, [name]: next } };
				}),
			);
			return undefined;
		},
	);

	const setInProject: McpServiceApi["setInProject"] = Effect.fn("Mcp.setInProject")(
		function* (folder, name, value) {
			const project = yield* requireProject(folder, "setting a server in this project");
			const global = yield* deps.store.read("global", project);
			const globalValue = global.servers[name];
			const globalRead = globalValue === undefined ? undefined : readMcpEntry(name, globalValue);
			if (globalRead?.kind !== "server") {
				return yield* refusal(
					name,
					`The global mcp.json does not define a server named "${name}".`,
				);
			}
			yield* editFile("project", project, (document) =>
				Effect.gen(function* () {
					const servers = yield* serversOf(document, "project");
					const existing = servers[name];
					if (existing !== undefined && !isRawOverride(existing)) {
						return yield* refusal(
							name,
							`This project defines its own server "${name}". Edit or remove that server instead.`,
						);
					}
					const next = { ...servers };
					if (value === "inherit") {
						delete next[name];
					} else {
						next[name] = { ...readRawObject(existing), enabled: value === "on" };
					}
					return { ...document, mcpServers: next };
				}),
			);
			return undefined;
		},
	);

	const setAutoEnableCodemode: McpServiceApi["setAutoEnableCodemode"] = Effect.fn(
		"Mcp.setAutoEnableCodemode",
	)(function* (folder, scope, enabled) {
		const targetFolder = yield* folderFor(
			folder,
			scope,
			"changing this project's autoEnableCodemode",
		);
		const otherScope: McpScope = scope === "global" ? "project" : "global";
		const other =
			otherScope === "project" && folder === null
				? undefined
				: yield* deps.store.read(otherScope, folder ?? "");
		yield* editFile(scope, targetFolder, (document) => {
			const next = { ...document };
			if (!enabled) next["autoEnableCodemode"] = false;
			// `true` is pi's default, so it removes the key unless the other file turns it
			// off: then this file has to say `true` or the other file's `false` still wins.
			else if (other?.autoEnableCodemode === false) next["autoEnableCodemode"] = true;
			else delete next["autoEnableCodemode"];
			return Effect.succeed(next);
		});
		return undefined;
	});

	const readRaw: McpServiceApi["readRaw"] = Effect.fn("Mcp.readRaw")(
		function* (folder, scope, name) {
			const targetFolder = yield* folderFor(folder, scope, "reading a project's .pi/mcp.json");
			const file = yield* deps.store.read(scope, targetFolder);
			const entry = file.servers[name];
			if (entry === undefined) {
				return yield* refusal(name, `The ${scope} mcp.json does not define "${name}".`);
			}
			return JSON.stringify(redactEntry(readRawObject(entry)), null, 2);
		},
	);

	const writeRaw: McpServiceApi["writeRaw"] = Effect.fn("Mcp.writeRaw")(
		function* (folder, scope, name, text) {
			if (!isMcpName(name)) {
				return yield* refusal(
					name,
					"A server name may only use letters, digits, dashes and underscores.",
				);
			}
			const decoded = Schema.decodeResult(Schema.fromJsonString(Schema.Unknown))(text);
			if (Result.isFailure(decoded)) {
				return yield* refusal(name, "The entry must be a JSON object.");
			}
			const parsed = decoded.success;
			if (!isJsonValue(parsed) || !isJsonObject(parsed)) {
				return yield* refusal(name, "The entry must be a JSON object.");
			}
			const targetFolder = yield* folderFor(folder, scope, "writing a project's .pi/mcp.json");
			yield* editFile(scope, targetFolder, (document) =>
				Effect.gen(function* () {
					const servers = yield* serversOf(document, scope);
					const next = yield* restoreStored(parsed, servers[name], []);
					const entry = readRawObject(next);
					yield* checkEntry(name, entry, scope, true);
					return { ...document, mcpServers: { ...servers, [name]: entry } };
				}),
			);
			return undefined;
		},
	);

	return {
		list,
		live,
		read,
		readRaw,
		remove,
		save,
		setAutoEnableCodemode,
		setEnabled,
		setInProject,
		writeRaw,
	};
};

export const McpServiceLive: Layer.Layer<McpService, never, McpStore | Engines | Log> =
	Layer.effect(
		McpService,
		Effect.gen(function* () {
			const store = yield* McpStore;
			const engines = yield* Engines;
			const log = yield* Log;
			return makeMcpService({
				live: mcpLiveReader({ log, queryAll: engines.queryAll("mcpLive") }),
				store,
			});
		}),
	);
