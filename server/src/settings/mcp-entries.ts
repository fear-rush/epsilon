/**
 * What pi would load from both files, in its order: every global entry first,
 * then this project's entries. A project entry that defines a server replaces the
 * global entry of its name; one that only sets override keys changes it. Both
 * stay listed, so the global entry a project replaces is visible instead of
 * hidden behind it.
 */
import type { McpOverrideKey, McpScope, McpTransport } from "shared";

import {
	applyOverride,
	entryProblem,
	extraOverrideKeys,
	isRawOverride,
	MCP_OVERRIDE_KEYS,
	rawEnabled,
	rawOverrideKeys,
	readMcpEntry,
	type McpEntry,
	type McpRawEntry,
} from "./mcp-entry";

interface ValidEntry {
	name: string;
	scope: McpScope;
	/** The entry as its own file holds it, parsed. */
	entry: McpEntry;
	/** What pi connects: the entry, or a global entry with a project override applied. */
	config: McpEntry;
	transport: McpTransport;
	overrideKeys?: McpOverrideKey[];
	overrideEnabled?: boolean;
	replacesGlobal?: boolean;
	replacedByProject?: boolean;
	overriddenByProject?: boolean;
}

interface InvalidEntry {
	name: string;
	scope: McpScope;
	problem: string;
	/** The entry's own `enabled`, so a row still shows Off while pi skips it. */
	enabled?: boolean;
	overrideKeys?: McpOverrideKey[];
}

export type LoadedEntry = ValidEntry | InvalidEntry;

interface InvalidFacts {
	enabled?: boolean;
	overrideKeys?: McpOverrideKey[];
}

/** Names that differ only in `-` and `_` would share pi's tool namespace. */
const namespaceOf = (name: string): string => `mcp__${name.replace(/-/g, "_")}`;

const invalid = (
	name: string,
	scope: McpScope,
	problem: string,
	facts: InvalidFacts = {},
): InvalidEntry => {
	const entry: InvalidEntry = { name, scope, problem };
	if (facts.enabled !== undefined) entry.enabled = facts.enabled;
	if (facts.overrideKeys !== undefined) entry.overrideKeys = facts.overrideKeys;
	return entry;
};

const readGlobalEntry = (
	name: string,
	value: McpRawEntry,
	takenNamespaces: Map<string, string>,
): LoadedEntry => {
	const read = readMcpEntry(name, value);
	const enabled = rawEnabled(value);
	if (read.kind === "invalid") return invalid(name, "global", read.problem, { enabled });
	if (read.kind === "override") {
		return invalid(name, "global", 'needs either "command" or "url".', { enabled });
	}
	const namespace = namespaceOf(name);
	const clash = takenNamespaces.get(namespace);
	if (clash !== undefined) {
		return invalid(name, "global", `shares its tool namespace with "${clash}", so pi skips it.`, {
			enabled,
		});
	}
	takenNamespaces.set(namespace, name);
	return {
		name,
		scope: "global",
		entry: read.entry,
		config: read.entry,
		transport: read.transport,
	};
};

const readProjectEntry = (
	name: string,
	value: McpRawEntry,
	globals: ReadonlyMap<string, ValidEntry>,
	takenNamespaces: Map<string, string>,
): LoadedEntry => {
	const read = readMcpEntry(name, value);
	const enabled = rawEnabled(value);
	if (read.kind === "invalid") {
		const facts: InvalidFacts = { enabled };
		if (isRawOverride(value)) facts.overrideKeys = rawOverrideKeys(value);
		return invalid(name, "project", read.problem, facts);
	}
	if (read.kind === "override") {
		const base = globals.get(name);
		if (base === undefined) {
			return invalid(
				name,
				"project",
				"pi needs a global server of this name to override, and the global mcp.json does not define one.",
				{ enabled, overrideKeys: read.keys },
			);
		}
		const extra = extraOverrideKeys(read.entry);
		if (extra.length > 0) {
			return invalid(
				name,
				"project",
				`an override can only set ${MCP_OVERRIDE_KEYS.join(", ")}; it also sets ${extra.join(", ")}.`,
				{ enabled, overrideKeys: read.keys },
			);
		}
		const config = applyOverride(base.config, read.entry);
		const problem = entryProblem(name, config);
		if (problem !== undefined) {
			return invalid(name, "project", problem, { enabled, overrideKeys: read.keys });
		}
		base.overriddenByProject = true;
		const entry: ValidEntry = {
			name,
			scope: "project",
			entry: read.entry,
			config,
			transport: config.url === undefined ? "stdio" : "http",
			overrideKeys: read.keys,
		};
		if (read.entry.enabled !== undefined) entry.overrideEnabled = read.entry.enabled;
		return entry;
	}
	if (read.entry.url !== undefined && read.entry.auth !== undefined) {
		return invalid(name, "project", "auth is only allowed in the global mcp.json.", { enabled });
	}
	const namespace = namespaceOf(name);
	const clash = takenNamespaces.get(namespace);
	if (clash !== undefined && clash !== name) {
		return invalid(name, "project", `shares its tool namespace with "${clash}", so pi skips it.`, {
			enabled,
		});
	}
	takenNamespaces.set(namespace, name);
	const entry: ValidEntry = {
		name,
		scope: "project",
		entry: read.entry,
		config: read.entry,
		transport: read.transport,
	};
	const global = globals.get(name);
	if (global !== undefined) {
		global.replacedByProject = true;
		entry.replacesGlobal = true;
	}
	return entry;
};

/** Every entry of both files, with what pi would load. */
export const entriesOf = (
	globalServers: Record<string, McpRawEntry>,
	projectServers: Record<string, McpRawEntry>,
): LoadedEntry[] => {
	const entries: LoadedEntry[] = [];
	const globals = new Map<string, ValidEntry>();
	const namespaces = new Map<string, string>();
	for (const [name, value] of Object.entries(globalServers)) {
		const entry = readGlobalEntry(name, value, namespaces);
		entries.push(entry);
		if ("entry" in entry) globals.set(name, entry);
	}
	for (const [name, value] of Object.entries(projectServers)) {
		entries.push(readProjectEntry(name, value, globals, namespaces));
	}
	return entries;
};
