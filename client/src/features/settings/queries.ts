import { queryOptions, skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import type { McpScope } from "shared";

import type { PackageView, SkillRoot } from "@/api/types";

import { providerLoginKeys, readinessKeys, settingsKeys } from "@/api/keys";
import {
	fetchMcpRaw,
	fetchPackageResources,
	fetchMcpServer,
	fetchProviderDetail,
	fetchProviderLogin,
	fetchSettings,
	fetchListedSkill,
	fetchSkill,
	fetchSkillBundleFile,
	fetchSkillFiles,
} from "@/api/endpoints";

/**
 * How long a settings read stays fresh. Every write invalidates the family, so
 * this only stops a mount or a focus from re-reading files that did not change.
 */
const SETTINGS_STALE_MS = 30_000;

/**
 * The settings snapshot. Sections share one query key, so the page loads it
 * once and every write invalidates the same family.
 */
export const settingsQuery = (project: string | undefined) =>
	queryOptions({
		queryKey: settingsKeys.snapshot(project),
		queryFn: ({ signal }) => fetchSettings(project, signal),
		staleTime: SETTINGS_STALE_MS,
	});

/** The editable detail of one provider, or nothing while the page has no id yet. */
export const providerQuery = (providerId: string | undefined) =>
	queryOptions({
		queryKey: settingsKeys.provider(providerId),
		queryFn:
			providerId === undefined
				? skipToken
				: ({ signal }) => fetchProviderDetail(providerId, signal),
		staleTime: SETTINGS_STALE_MS,
	});

/** The editable detail of one MCP server, or nothing while the page has no name yet. */
export const mcpQuery = (project: string | undefined, scope: McpScope, name: string | undefined) =>
	queryOptions({
		queryKey: settingsKeys.mcp(project, scope, name),
		queryFn:
			name === undefined ? skipToken : ({ signal }) => fetchMcpServer(project, scope, name, signal),
		staleTime: SETTINGS_STALE_MS,
	});

/** The editable detail of one skill in one root, or nothing while the page has no name yet. */
export const skillQuery = (
	project: string | undefined,
	root: SkillRoot,
	name: string | undefined,
) =>
	queryOptions({
		queryKey: settingsKeys.skill(project, root, name),
		queryFn:
			name === undefined ? skipToken : ({ signal }) => fetchSkill(project, root, name, signal),
		staleTime: SETTINGS_STALE_MS,
	});

/** The file of a skill pi lists, whoever owns it; read-only pages use this. */
export const listedSkillQuery = (project: string | undefined, filePath: string) =>
	queryOptions({
		queryKey: settingsKeys.skillListed(project, filePath),
		queryFn: ({ signal }) => fetchListedSkill(project, filePath, signal),
		staleTime: SETTINGS_STALE_MS,
	});

/** What one declared package provides, as pi resolves it. */
export const packageResourcesQuery = (
	project: string | undefined,
	source: string,
	scope: PackageView["scope"],
) =>
	queryOptions({
		queryKey: settingsKeys.packageResources(project, scope, source),
		queryFn: ({ signal }) => fetchPackageResources(project, source, scope, signal),
		staleTime: SETTINGS_STALE_MS,
	});

/**
 * The project the resource sections show beside the agent home, from the Settings
 * URL, or undefined for Global. Every settings read and write passes it on.
 */
export const useSettingsProject = (): string | undefined =>
	useSearch({ from: "/settings", select: (search) => search.project });

export const useSettings = () => useQuery(settingsQuery(useSettingsProject()));

/**
 * Re-read the settings snapshot after a write, and the readiness answer with it:
 * adding a provider is what makes the not-ready notice clear. The function is stable
 * so an effect may depend on it.
 */
export const useSettingsRefresh = (): (() => void) => {
	const queryClient = useQueryClient();
	return useCallback(() => {
		void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
		void queryClient.invalidateQueries({ queryKey: readinessKeys.all });
	}, [queryClient]);
};

/** The editable detail of one provider. `undefined` means a new, unsaved one. */
export const useProviderDetail = (providerId: string | undefined) =>
	useQuery(providerQuery(providerId));

/** How often a running sign-in is re-read. pi asks and reports out of band, so the
 * page polls; once the flow settles, polling stops and the state stays as it is. */
const LOGIN_POLL_MS = 800;

/** One sign-in pi is running, followed until it settles. */
export const useProviderLogin = (providerId: string | undefined) =>
	useQuery({
		queryKey: providerLoginKeys.one(providerId),
		queryFn:
			providerId === undefined ? skipToken : ({ signal }) => fetchProviderLogin(providerId, signal),
		refetchInterval: (query) => (query.state.data?.status === "running" ? LOGIN_POLL_MS : false),
		// No flow has run yet, so a 404 is an answer, not something to retry.
		retry: false,
	});

/** The editable detail of one MCP server. `undefined` means a new one. */
export const useMcpServer = (scope: McpScope, name: string | undefined) =>
	useQuery(mcpQuery(useSettingsProject(), scope, name));

/** One MCP server's entry as JSON text, secrets hidden. */
export const useMcpRaw = (scope: McpScope, name: string) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: settingsKeys.mcpRaw(project, scope, name),
		queryFn: ({ signal }) => fetchMcpRaw(project, scope, name, signal),
		staleTime: SETTINGS_STALE_MS,
	});
};

/** The editable detail of one skill in one root. `undefined` means a new one. */
export const useSkill = (root: SkillRoot, name: string | undefined) =>
	useQuery(skillQuery(useSettingsProject(), root, name));

/** The file of a skill pi lists, whoever owns it; read-only pages use this. */
export const useListedSkill = (filePath: string) =>
	useQuery(listedSkillQuery(useSettingsProject(), filePath));

/** Every file in one existing skill's folder. `undefined` (a new skill) reads nothing. */
export const useSkillFiles = (root: SkillRoot, name: string | undefined) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: settingsKeys.skillFiles(project, root, name ?? ""),
		queryFn:
			name === undefined ? skipToken : ({ signal }) => fetchSkillFiles(project, root, name, signal),
		staleTime: SETTINGS_STALE_MS,
	});
};

/** One bundled text file. The panel keeps its own draft, so a refetch never replaces typing. */
export const useSkillBundleFile = (root: SkillRoot, name: string, path: string) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: settingsKeys.skillFile(project, root, name, path),
		queryFn: ({ signal }) => fetchSkillBundleFile(project, root, name, path, signal),
		gcTime: 0,
		refetchOnWindowFocus: false,
	});
};

/** What one declared package provides, as pi resolves it. */
export const usePackageResources = (source: string, scope: PackageView["scope"]) =>
	useQuery(packageResourcesQuery(useSettingsProject(), source, scope));
