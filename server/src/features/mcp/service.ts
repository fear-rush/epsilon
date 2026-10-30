/**
 * What the MCP panel reads and writes. MCP servers live in two files: the agent
 * home's `mcp.json` and this deployment's `<project>/.pi/mcp.json`. pi reads the
 * project file because the embedded engine starts trusted
 * (docs/reference/pi-sdk.md), and a project entry replaces or overrides a global
 * one of its name. Settings shows both, as pi resolves them.
 *
 * Reads turn both documents into the list and one server's detail, following
 * `loadMcpConfig()` in file order. Every write is a locked read-modify-write on
 * its file (`store.ts`), keeps unknown keys, and never replaces a file it cannot
 * parse.
 *
 * `enabled` is the switch's to write, never a form save: `false` writes the key
 * and `true` removes it, as pi's own writer does, except on an override, which
 * keeps the value written because it replaces the global entry's.
 */
import type { McpScope } from "shared";

import type { AgentHome } from "../../platform/agent-home";
import { mergeSecrets, setDefined, setOrDelete } from "../../platform/patch";
import { packageManager } from "../../platform/pi";
import {
	entriesOf,
	isRawOverride,
	isRecord,
	readMcpEntry,
	readRawObject,
	stringMapOf,
	targetOf,
} from "./domain";
import type { LoadedEntry } from "./domain";
import { mcpDocument } from "./store";
import type { McpInProjectInput, McpServerDetail, McpServerInput, McpServerView } from "./contract";

const toView = (entry: LoadedEntry): McpServerView => {
	const view: McpServerView = {
		name: entry.name,
		scope: entry.scope,
		target: "",
		enabled: true,
	};
	if (entry.overrideKeys !== undefined) view.overrideKeys = entry.overrideKeys;
	if (!("entry" in entry)) {
		view.invalid = entry.problem;
		view.enabled = entry.enabled ?? true;
		return view;
	}
	const config = entry.config;
	view.target = targetOf(config);
	view.enabled = config.enabled !== false;
	view.transport = entry.transport;
	if (config.description !== undefined) view.description = config.description;
	if (config.exposure !== undefined) view.exposure = config.exposure;
	if (config.timeout !== undefined) view.timeout = config.timeout;
	if (entry.overrideEnabled !== undefined) view.overrideEnabled = entry.overrideEnabled;
	if (entry.replacesGlobal === true) view.replacesGlobal = true;
	if (entry.replacedByProject === true) view.replacedByProject = true;
	if (entry.overriddenByProject === true) view.overriddenByProject = true;
	return view;
};

async function loadEntries(
	home: AgentHome,
	projectDir: string,
): Promise<{ entries: LoadedEntry[]; problems: string[] }> {
	const [globalDocument, projectDocument] = await Promise.all([
		mcpDocument("global", home, projectDir).read(),
		mcpDocument("project", home, projectDir).read(),
	]);
	const problems: string[] = [];
	if (globalDocument.problem !== undefined) problems.push(globalDocument.problem);
	if (projectDocument.problem !== undefined) problems.push(projectDocument.problem);
	return {
		entries: entriesOf(
			globalDocument.value.mcpServers ?? {},
			projectDocument.value.mcpServers ?? {},
		),
		problems,
	};
}

/** The two files as one list: this project's entries first, then the global ones. */
export async function listMcpServers(
	home: AgentHome,
	projectDir: string,
): Promise<{ servers: McpServerView[]; error?: string }> {
	const { entries, problems } = await loadEntries(home, projectDir);
	const servers = entries
		.map(toView)
		.sort((left, right) =>
			left.scope === right.scope
				? left.name.localeCompare(right.name)
				: left.scope === "project"
					? -1
					: 1,
		);
	if (problems.length === 0) return { servers };
	return { servers, error: problems.join(" ") };
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
	const detail: McpServerDetail = {
		...toView(entry),
		envKeys: [],
		headerKeys: [],
		oauthKeys: [],
		toolExposureKeys: [],
	};
	if (!("entry" in entry)) return detail;
	const config = entry.config;
	if (config.command !== undefined) detail.command = config.command;
	if (config.args !== undefined) detail.args = config.args;
	if (config.cwd !== undefined) detail.cwd = config.cwd;
	if (config.url !== undefined) detail.url = config.url;
	if (config.auth !== undefined) detail.authProvider = config.auth.provider;
	detail.envKeys = Object.keys(stringMapOf(config.env));
	detail.headerKeys = Object.keys(stringMapOf(config.headers));
	detail.oauthKeys = Object.keys(config.oauth ?? {});
	detail.toolExposureKeys = Object.keys(config.toolExposure ?? {});
	return detail;
}

/**
 * Whether this deployment's settings turn the built-in MCP extension off.
 *
 * pi resolves the built-ins named in `settings.extensions` (global and, for a
 * trusted project, project) through `DefaultPackageManager`, which the SDK
 * exports. Passing `builtinExtensions: ["mcp"]` and skipping every missing
 * package asks pi that one question: what `-builtin:mcp` and a project
 * `+builtin:mcp` resolve to. No package is installed or looked up.
 */
export const isMcpTurnedOff = async (projectDir: string, home: AgentHome): Promise<boolean> => {
	try {
		const manager = packageManager(projectDir, home, ["mcp"]);
		const resolved = await manager.resolve(async () => "skip" as const);
		return resolved.extensions.find((entry) => entry.path === "builtin:mcp")?.enabled === false;
	} catch {
		// ponytail: a broken package source must not take the whole settings page
		// down. The panel then misses the notice; the session loader reports the
		// package error itself.
		return false;
	}
};

const validHttpUrl = (url: string): void => {
	if (!URL.canParse(url) || !/^https?:$/.test(new URL(url).protocol)) {
		throw new Error("An MCP URL must start with http:// or https://.");
	}
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
