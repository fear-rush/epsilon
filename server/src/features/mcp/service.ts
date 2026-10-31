/**
 * What the MCP panel reads and writes. MCP servers live in two files: the agent
 * home's `mcp.json` and the `<project>/.pi/mcp.json`. pi reads the
 * project file because the embedded engine starts trusted
 * (docs/pi-sdk.md), and a project entry replaces or overrides a global
 * one of its name. Settings shows both, as pi resolves them.
 *
 * Reads turn both documents into the list and one server's detail, following
 * `loadMcpConfig()` in file order. Every write is a locked read-modify-write on
 * its file (`store.ts`), keeps unknown keys, and never replaces a file it cannot
 * parse. A save is also run back through pi's own rules, so this form cannot
 * write an entry pi would skip.
 *
 * `enabled` is the switch's to write, never a form save: `false` writes the key
 * and `true` removes it, as pi's own writer does, except on an override, which
 * keeps the value written because it replaces the global entry's.
 */
import type { McpExposure, McpOAuth, McpOAuthJson, McpScope } from "shared";
import { mcpOAuthJsonSchema, mcpOAuthSchema, mcpToolExposureSchema, oauthProblem } from "shared";

import type { AgentHome } from "../../platform/agent-home";
import { mergeSecrets, setDefined, setOrDelete } from "../../platform/patch";
import { packageManager, settingsManager } from "../../platform/pi";
import {
	entriesOf,
	projectEntryProblem,
	indirectExposuresOf,
	isRawOverride,
	isRecord,
	readAuthProvider,
	readMcpEntry,
	readRawObject,
	readRawSettings,
	readTarget,
	stringMapOf,
	targetOf,
} from "./domain";
import type { McpServer } from "./domain";
import { hasMcpCredentials, mcpLogTail } from "./diagnostics";
import { mcpDocument } from "./store";
import type {
	McpAutoEnableInput,
	McpInProjectInput,
	McpReach,
	McpServerDetail,
	McpServerInput,
	McpServerView,
} from "./contract";

type Connectable = Extract<McpServer, { kind: "server" | "override" }>;

/** What a row shows of an entry pi can connect; an unset key is `undefined` and JSON drops it. */
const connectableFields = (entry: Connectable) => {
	const config = entry.config;
	return {
		name: entry.name,
		target: targetOf(config),
		transport: entry.transport,
		enabled: config.enabled !== false,
		description: config.description,
		exposure: config.exposure,
		needsIndirect: indirectExposuresOf(config).length > 0,
		timeout: config.timeout,
	};
};

/** A project entry that only changes keys: the same in the list and in the detail. */
const overrideView = (entry: Extract<McpServer, { kind: "override" }>) => ({
	kind: "override" as const,
	scope: "project" as const,
	...connectableFields(entry),
	overrideKeys: entry.keys,
	overrideEnabled: entry.enabled,
});

/** An entry pi skips: the list and the detail show the same row, and the detail adds its target. */
const invalidView = (entry: Extract<McpServer, { kind: "invalid" }>) => ({
	kind: "invalid" as const,
	name: entry.name,
	scope: entry.scope,
	problem: entry.problem,
	enabled: entry.enabled,
	overrideKeys: entry.overrideKeys,
});

const toView = (entry: McpServer): McpServerView =>
	entry.kind === "server"
		? {
				kind: "server",
				scope: entry.scope,
				...connectableFields(entry),
				relation: entry.relation,
			}
		: entry.kind === "override"
			? overrideView(entry)
			: invalidView(entry);

/**
 * The OAuth block without its secret, which never leaves the server. An option
 * this version does not model stays in the file (the write keeps it) but is not
 * shown here.
 */
const oauthOf = (oauth: McpOAuth | undefined) =>
	oauth === undefined
		? undefined
		: {
				clientId: oauth.clientId,
				callbackPort: oauth.callbackPort,
				callbackUrl: oauth.callbackUrl,
				scope: oauth.scope,
				clientName: oauth.clientName,
				clientRegistration: oauth.clientRegistration,
				authServerMetadataUrl: oauth.authServerMetadataUrl,
			};

/** What one entry's detail sends, before the file's own diagnostics are read. */
const detailOf = (entry: McpServer): McpServerDetail => {
	if (entry.kind === "override") return overrideView(entry);
	if (entry.kind === "invalid") {
		const raw = entry.raw;
		const toolExposure = mcpToolExposureSchema.safeParse(raw.toolExposure);
		const oauth = mcpOAuthSchema.safeParse(raw.oauth);
		const usable = oauth.success && oauthProblem(oauth.data) === undefined;
		return {
			...invalidView(entry),
			...readTarget(raw),
			...readRawSettings(raw),
			toolExposure: toolExposure.success ? toolExposure.data : undefined,
			oauth: usable ? oauthOf(oauth.data) : undefined,
			oauthClientSecret: oauth.success && oauth.data.clientSecret !== undefined,
			authProvider: readAuthProvider(raw.auth),
		};
	}
	const config = entry.config;
	return {
		kind: "server",
		scope: entry.scope,
		...connectableFields(entry),
		relation: entry.relation,
		command: config.command,
		args: config.args,
		cwd: config.cwd,
		url: config.url,
		authProvider: config.auth?.provider,
		envKeys: Object.keys(stringMapOf(config.env)),
		headerKeys: Object.keys(stringMapOf(config.headers)),
		toolExposure: config.toolExposure,
		oauth: oauthOf(config.oauth),
		oauthClientSecret: config.oauth?.clientSecret !== undefined,
		// Filled in by `readMcpServer`, which reads two more files.
		credentialsStored: false,
		log: [],
	};
};

type FileReadings = {
	entries: McpServer[];
	problems: string[];
	autoEnableCodemode: McpReach["autoEnableCodemode"];
};

async function loadEntries(home: AgentHome, projectDir: string): Promise<FileReadings> {
	const [globalDocument, projectDocument] = await Promise.all([
		mcpDocument("global", home, projectDir).read(),
		mcpDocument("project", home, projectDir).read(),
	]);
	const problems: string[] = [];
	if (globalDocument.problem !== undefined) problems.push(globalDocument.problem);
	if (projectDocument.problem !== undefined) problems.push(projectDocument.problem);
	const autoEnableCodemode: McpReach["autoEnableCodemode"] = {};
	const globalAuto = globalDocument.value.autoEnableCodemode;
	const projectAuto = projectDocument.value.autoEnableCodemode;
	if (globalAuto !== undefined) autoEnableCodemode.global = globalAuto;
	if (projectAuto !== undefined) autoEnableCodemode.project = projectAuto;
	return {
		entries: entriesOf(
			globalDocument.value.mcpServers ?? {},
			projectDocument.value.mcpServers ?? {},
		),
		problems,
		autoEnableCodemode,
	};
}

/**
 * Whether `settings.json` turns a built-in off, read through pi's own resolver:
 * what `-builtin:<name>` and a project `+builtin:<name>` add up to. No package is
 * installed or looked up.
 */
const builtinTurnedOff = async (
	projectDir: string,
	home: AgentHome,
	name: string,
): Promise<boolean> => {
	try {
		const manager = packageManager(projectDir, home, [name]);
		const resolved = await manager.resolve(async () => "skip" as const);
		return resolved.extensions.find((entry) => entry.path === `builtin:${name}`)?.enabled === false;
	} catch {
		// ponytail: a broken package source must not take the whole settings page
		// down. The panel then misses the notice; the session loader reports the
		// package error itself.
		return false;
	}
};

/**
 * Whether the settings turn the built-in MCP extension off.
 *
 * pi resolves the built-ins named in `settings.extensions` (global and, for a
 * trusted project, project) through `DefaultPackageManager`, which the SDK
 * exports. Passing `builtinExtensions: ["mcp"]` and skipping every missing
 * package asks pi that one question: what `-builtin:mcp` and a project
 * `+builtin:mcp` resolve to. No package is installed or looked up.
 */
export const isMcpTurnedOff = (projectDir: string, home: AgentHome): Promise<boolean> =>
	builtinTurnedOff(projectDir, home, "mcp");

/**
 * The servers nothing can reach, one row per name. A project entry that replaces a
 * global one of the same name is the one pi loads, so the replaced entry is
 * dropped rather than listed twice.
 */
const unreachableOf = (entries: Connectable[]) => {
	const seen = new Map<string, McpExposure[]>();
	for (const entry of entries) {
		if (entry.kind === "server" && entry.relation === "replaced-by-project") continue;
		const exposures = indirectExposuresOf(entry.config);
		if (exposures.length > 0) seen.set(entry.name, exposures);
	}
	return [...seen].map(([name, exposures]) => ({ name, exposures }));
};

/**
 * Which servers the next session cannot reach, and why. pi activates `codemode`
 * for a `codemode` server only while `autoEnableCodemode` is on, and `tool_search`
 * for a `deferred` one; either reaching tool can call both kinds of tool, so one
 * of them being able to run is enough. `defaultTools` naming codemode counts as
 * active, which is the other half of pi's own rule.
 */
const reachOf = async (
	home: AgentHome,
	projectDir: string,
	entries: McpServer[],
	autoEnableCodemode: McpReach["autoEnableCodemode"],
): Promise<McpReach> => {
	const auto = autoEnableCodemode.project ?? autoEnableCodemode.global ?? true;
	const defaultTools = settingsManager(projectDir, home).getDefaultTools() ?? [];
	const [codemodeDisabled, toolSearchDisabled] = await Promise.all([
		builtinTurnedOff(projectDir, home, "codemode"),
		builtinTurnedOff(projectDir, home, "tool-search"),
	]);
	const enabled = entries.filter(
		(entry): entry is Connectable => entry.kind !== "invalid" && entry.config.enabled !== false,
	);
	const needs = (exposure: McpExposure): boolean =>
		enabled.some((entry) => indirectExposuresOf(entry.config).includes(exposure));
	// pi activates a reaching tool in one of two ways: this file's switch, or the
	// server that needs it connecting while the built-in can act on it. `codemode`
	// for a codemode server, `tool_search` for a deferred one, and either can call
	// both kinds of tool.
	const codemodeDefault = defaultTools.includes("codemode");
	const toolSearchDefault = defaultTools.includes("tool_search");
	const codemode = !codemodeDisabled && (codemodeDefault || (needs("codemode") && auto));
	const toolSearch = !toolSearchDisabled && (toolSearchDefault || needs("deferred"));
	const unreachable = codemode || toolSearch ? [] : unreachableOf(enabled);
	return {
		autoEnableCodemode,
		codemodeDefault,
		codemodeDisabled,
		toolSearchDisabled,
		unreachable,
	};
};

export type McpListing = {
	servers: McpServerView[];
	reach: McpReach;
	error?: string;
};

/** The two files as one list, this project's entries first, and what the next session can reach. */
export async function listMcpServers(home: AgentHome, projectDir: string): Promise<McpListing> {
	const { entries, problems, autoEnableCodemode } = await loadEntries(home, projectDir);
	const servers = entries
		.map(toView)
		.sort((left, right) =>
			left.scope === right.scope
				? left.name.localeCompare(right.name)
				: left.scope === "project"
					? -1
					: 1,
		);
	const reach = await reachOf(home, projectDir, entries, autoEnableCodemode);
	if (problems.length === 0) return { servers, reach };
	return { servers, reach, error: problems.join(" ") };
}

export async function readMcpServer(
	home: AgentHome,
	projectDir: string,
	scope: McpScope,
	name: string,
): Promise<McpServerDetail | undefined> {
	const { entries } = await loadEntries(home, projectDir);
	const entry = entries.find((candidate) => candidate.scope === scope && candidate.name === name);
	if (entry === undefined) return undefined;
	const detail = detailOf(entry);
	if (detail.kind !== "server") return detail;
	const [log, credentialsStored] = await Promise.all([
		mcpLogTail(home, name),
		hasMcpCredentials(home, name, detail.url),
	]);
	return { ...detail, log, credentialsStored };
}

const validHttpUrl = (url: string): void => {
	if (!URL.canParse(url) || !/^https?:$/.test(new URL(url).protocol)) {
		throw new Error("An MCP URL must start with http:// or https://.");
	}
};

/**
 * The OAuth block to write: one key at a time on a copy of what the file holds,
 * so an option the form left blank is removed and one this version does not model
 * is kept. `clientSecret` follows the same rule as an environment value: a blank
 * one keeps the stored secret.
 */
const oauthToWrite = (
	input: NonNullable<Extract<McpServerInput, { transport: "http" }>["oauth"]>,
	stored: McpOAuthJson,
): McpOAuthJson => {
	const next: McpOAuthJson = { ...stored };
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
		next.clientSecret = input.clientSecret;
	}
	return next;
};

/** Save one server into the file its scope names. */
export const writeMcpServer = (
	home: AgentHome,
	projectDir: string,
	input: McpServerInput,
): Promise<void> =>
	mcpDocument(input.scope, home, projectDir).update((document) => {
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
		setOrDelete(next, "description", input.description);
		setOrDelete(next, "exposure", input.exposure === "codemode" ? undefined : input.exposure);
		setDefined(next, "timeout", input.timeout);
		setOrDelete(next, "toolExposure", input.toolExposure);

		if (input.transport === "stdio") {
			delete next.url;
			delete next.headers;
			delete next.oauth;
			delete next.auth;
			next.command = input.command;
			setOrDelete(next, "args", input.args);
			setOrDelete(next, "cwd", input.cwd);
			const env = mergeSecrets(input.env, stringMapOf(next.env), { onMissingStored: "throw" });
			setOrDelete(next, "env", env);
		} else {
			validHttpUrl(input.url);
			delete next.command;
			delete next.args;
			delete next.env;
			delete next.cwd;
			next.url = input.url;
			const headers = mergeSecrets(input.headers, stringMapOf(next.headers), {
				onMissingStored: "throw",
			});
			setOrDelete(next, "headers", headers);
			const storedOAuth = mcpOAuthJsonSchema.safeParse(next.oauth);
			const oauth =
				input.oauth === undefined
					? undefined
					: oauthToWrite(input.oauth, storedOAuth.success ? storedOAuth.data : {});
			if (oauth === undefined || Object.keys(oauth).length === 0) delete next.oauth;
			else next.oauth = oauth;
			// pi refuses `auth` in a project file: a repository cannot pick where a
			// credential goes. The form does not offer it there either.
			if (input.scope === "project" || input.authProvider === undefined) delete next.auth;
			else next.auth = { provider: input.authProvider };
		}

		// The form can only write what pi loads. An unknown key is harmless; a key pi
		// validates that this form did not produce is not, so the entry is checked
		// with pi's rules before it is written and the refusal names the reason.
		const read = readMcpEntry(input.name, next);
		if (read.kind === "invalid") {
			const file = input.scope === "global" ? "the global mcp.json" : "this project's .pi/mcp.json";
			throw new Error(`${read.problem} Fix that key in ${file}.`);
		}
		if (read.kind !== "server") {
			throw new Error(`pi would read "${input.name}" as an override, not a server.`);
		}
		if (input.scope === "project") {
			const problem = projectEntryProblem(read.entry);
			if (problem !== undefined) throw new Error(problem);
		}

		servers[input.name] = next;
		return { ...document, mcpServers: servers };
	});

export const removeMcpServer = (
	home: AgentHome,
	projectDir: string,
	scope: McpScope,
	name: string,
): Promise<void> =>
	mcpDocument(scope, home, projectDir).update((document) => {
		const servers = document.mcpServers ?? {};
		if (servers[name] === undefined) {
			throw new Error(`mcp.json does not define "${name}" any more.`);
		}
		delete servers[name];
		return { ...document, mcpServers: servers };
	});

/** Turn one server on or off in its own file, as pi's `/mcp` writes it. */
export const setMcpServerEnabled = (
	home: AgentHome,
	projectDir: string,
	scope: McpScope,
	name: string,
	enabled: boolean,
): Promise<void> =>
	mcpDocument(scope, home, projectDir).update((document) => {
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
		return { ...document, mcpServers: servers };
	});

/**
 * A file's `autoEnableCodemode`. Turning it off writes `false`; turning it on
 * removes the key, which is pi's default, unless the other file turns it off:
 * then this file has to say `true` or the other file's `false` would still win.
 * Only the file named here changes.
 */
export const setMcpAutoEnableCodemode = (
	home: AgentHome,
	projectDir: string,
	input: McpAutoEnableInput,
): Promise<void> =>
	mcpDocument(input.scope, home, projectDir).update(async (document) => {
		const otherScope: McpScope = input.scope === "global" ? "project" : "global";
		const other = await mcpDocument(otherScope, home, projectDir).read();
		const next = { ...document };
		if (!input.enabled) next.autoEnableCodemode = false;
		else if (other.value.autoEnableCodemode === false) next.autoEnableCodemode = true;
		else delete next.autoEnableCodemode;
		return next;
	});

/**
 * A global server's state in this project: `inherit` removes the project's
 * override, `on` and `off` write one. A project server of the same name is never
 * touched, and a global server that does not load cannot be overridden.
 */
export const setMcpServerInProject = async (
	home: AgentHome,
	projectDir: string,
	input: McpInProjectInput,
): Promise<void> => {
	const globalDocument = await mcpDocument("global", home, projectDir).read();
	const globalValue = (globalDocument.value.mcpServers ?? {})[input.name];
	const globalRead = globalValue === undefined ? undefined : readMcpEntry(input.name, globalValue);
	if (globalRead?.kind !== "server") {
		throw new Error(`The global mcp.json does not define a server named "${input.name}".`);
	}
	await mcpDocument("project", home, projectDir).update((document) => {
		const servers = document.mcpServers ?? {};
		const existing = servers[input.name];
		if (existing !== undefined && !isRawOverride(existing)) {
			throw new Error(
				`This project defines its own server "${input.name}". Edit or remove that server instead.`,
			);
		}
		if (input.value === "inherit") {
			if (existing === undefined) return undefined;
			delete servers[input.name];
		} else {
			const next = { ...readRawObject(existing) };
			next.enabled = input.value === "on";
			servers[input.name] = next;
		}
		return { ...document, mcpServers: servers };
	});
};
