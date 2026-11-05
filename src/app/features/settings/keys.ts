/**
 * The settings read family. Every section shares the snapshot's key, so a write
 * invalidates one family and each page re-reads what it shows.
 */
const all = ["config", "settings"] as const;

export const settingsKeys = {
	all,
	context: (project: string | undefined) => [...all, "context", project ?? null] as const,
	snapshot: (project: string | undefined) => [...all, "snapshot", project ?? null] as const,
	packageResources: (project: string | undefined, scope: string, source: string) =>
		[...all, "package-resources", project ?? null, scope, source] as const,
	packageUpdates: (project: string | undefined) =>
		[...all, "package-updates", project ?? null] as const,
	mcpRegistrySearch: (source: string, q: string) =>
		[...all, "mcp-registry-search", source, q] as const,
	mcpRegistryServer: (source: string, name: string | undefined) =>
		[...all, "mcp-registry-server", source, name ?? ""] as const,
	providerLogin: (providerId: string) => [...all, "provider-login", providerId] as const,
	providerDetail: (providerId: string | undefined) =>
		[...all, "provider-detail", providerId ?? ""] as const,
	providerModels: (providerId: string | undefined, baseUrl: string, api: string, apiKey: string) =>
		[...all, "provider-models", providerId ?? "", baseUrl, api, apiKey] as const,
	skillFiles: (project: string | undefined, root: string, name: string) =>
		[...all, "skill-files", project ?? null, root, name] as const,
	skillFile: (project: string | undefined, root: string, name: string, path: string) =>
		[...all, "skill-file", project ?? null, root, name, path] as const,
	skillDocumentFiles: (project: string | undefined, filePath: string) =>
		[...all, "skill-document-files", project ?? null, filePath] as const,
	skillDocumentFile: (project: string | undefined, filePath: string, path: string) =>
		[...all, "skill-document-file", project ?? null, filePath, path] as const,
};
