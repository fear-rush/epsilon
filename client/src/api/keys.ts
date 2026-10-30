/**
 * Every TanStack Query key, written once. A key lives here so the hook that reads
 * it and the code that invalidates it cannot drift apart. Everything under
 * `settingsKeys.all` is one family: a write to the agent's configuration
 * invalidates the whole family by prefix.
 */
import type { McpScope } from "shared";

export const settingsKeys = {
	all: ["settings"] as const,
	snapshot: () => [...settingsKeys.all, "snapshot"] as const,
	provider: (id: string | undefined) => [...settingsKeys.all, "provider", id] as const,
	mcp: (scope: McpScope, name: string | undefined) =>
		[...settingsKeys.all, "mcp", scope, name] as const,
	skill: (name: string | undefined) => [...settingsKeys.all, "skill", name] as const,
};

export const readinessKeys = {
	all: ["readiness"] as const,
};

export const sessionKeys = {
	all: ["sessions"] as const,
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
