/**
 * Every TanStack Query key, written once. A key lives here so the hook that reads
 * it and the code that invalidates it cannot drift apart. Everything under
 * `settingsKeys.all` is one family: a write to the agent's configuration
 * invalidates the whole family by prefix.
 */
import type { McpScope } from "shared";

import type { SkillRoot } from "./types";

/** Reads that depend on the Settings project carry it, so a switch is a new key. */
export const settingsKeys = {
	all: ["settings"] as const,
	snapshot: (project: string | undefined) => [...settingsKeys.all, "snapshot", project] as const,
	provider: (id: string | undefined) => [...settingsKeys.all, "provider", id] as const,
	mcp: (project: string | undefined, scope: McpScope, name: string | undefined) =>
		[...settingsKeys.all, "mcp", project, scope, name] as const,
	mcpRaw: (project: string | undefined, scope: McpScope, name: string) =>
		[...settingsKeys.all, "mcp-raw", project, scope, name] as const,
	mcpRegistrySearch: (source: string, q: string) =>
		[...settingsKeys.all, "mcp-registry", source, q] as const,
	mcpRegistryServer: (source: string, name: string | undefined) =>
		[...settingsKeys.all, "mcp-registry-server", source, name] as const,
	skill: (project: string | undefined, root: SkillRoot, name: string | undefined) =>
		[...settingsKeys.all, "skill", project, root, name] as const,
	skillListed: (project: string | undefined, filePath: string) =>
		[...settingsKeys.all, "skill-listed", project, filePath] as const,
	skillListedFiles: (project: string | undefined, filePath: string) =>
		[...settingsKeys.all, "skill-listed-files", project, filePath] as const,
	skillListedFile: (project: string | undefined, filePath: string, path: string) =>
		[...settingsKeys.all, "skill-listed-file", project, filePath, path] as const,
	skillFiles: (project: string | undefined, root: SkillRoot, name: string) =>
		[...settingsKeys.all, "skill-files", project, root, name] as const,
	packageResources: (project: string | undefined, scope: string, source: string) =>
		[...settingsKeys.all, "package-resources", project, scope, source] as const,
	skillFile: (project: string | undefined, root: SkillRoot, name: string, path: string) =>
		[...settingsKeys.all, "skill-file", project, root, name, path] as const,
};

export const readinessKeys = {
	all: ["readiness"] as const,
};

export const sessionKeys = {
	all: ["sessions"] as const,
	/** Chats in Epsilon's trash. Under `all`, so a delete or restore refreshes it too. */
	trash: ["sessions", "trash"] as const,
};

export const projectKeys = {
	status: (path: string) => ["project", "status", path] as const,
	folders: (path: string | undefined, hidden = false) =>
		["project", "folders", path, hidden] as const,
};

/** A live probe of a provider's endpoint. It is not configuration, so it sits outside `settingsKeys`. */
export const probeKeys = {
	providerModels: (providerId: string | undefined, baseUrl: string, api: string, apiKey: string) =>
		["provider-import", providerId, baseUrl, api, apiKey] as const,
};

/**
 * A sign-in pi is running. It lives in the server process for as long as the flow
 * does, not in configuration, so it sits outside `settingsKeys` too.
 */
export const providerLoginKeys = {
	one: (providerId: string | undefined) => ["provider-login", providerId] as const,
};
