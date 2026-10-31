import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
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
 * The settings snapshot. Sections share one query key, so the page loads it
 * once and every write invalidates the same family.
 */
export const useSettings = () => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: settingsKeys.snapshot(project),
		queryFn: () => fetchSettings(project),
	});
};

/**
 * The project the resource sections show beside the agent home, from the Settings
 * URL, or undefined for Global. Every settings read and write passes it on.
 */
export const useSettingsProject = (): string | undefined =>
	useSearch({ from: "/settings" }).project;

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
	useQuery({
		queryKey: settingsKeys.provider(providerId),
		queryFn: providerId === undefined ? skipToken : () => fetchProviderDetail(providerId),
	});

/** How often a running sign-in is re-read. pi asks and reports out of band, so the
 * page polls; once the flow settles, polling stops and the state stays as it is. */
const LOGIN_POLL_MS = 800;

/** One sign-in pi is running, followed until it settles. */
export const useProviderLogin = (providerId: string | undefined) =>
	useQuery({
		queryKey: providerLoginKeys.one(providerId),
		queryFn: providerId === undefined ? skipToken : () => fetchProviderLogin(providerId),
		refetchInterval: (query) => (query.state.data?.status === "running" ? LOGIN_POLL_MS : false),
		// No flow has run yet, so a 404 is an answer, not something to retry.
		retry: false,
	});

/** The editable detail of one MCP server. `undefined` means a new one. */
export const useMcpServer = (scope: McpScope, name: string | undefined) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: settingsKeys.mcp(project, scope, name),
		queryFn: name === undefined ? skipToken : () => fetchMcpServer(project, scope, name),
	});
};

/** One MCP server's entry as JSON text, secrets hidden. */
export const useMcpRaw = (scope: McpScope, name: string) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: settingsKeys.mcpRaw(project, scope, name),
		queryFn: () => fetchMcpRaw(project, scope, name),
	});
};

/** The editable detail of one skill in one root. `undefined` means a new one. */
export const useSkill = (root: SkillRoot, name: string | undefined) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: settingsKeys.skill(project, root, name),
		queryFn: name === undefined ? skipToken : () => fetchSkill(project, root, name),
	});
};

/** The file of a skill pi lists, whoever owns it; read-only pages use this. */
export const useListedSkill = (filePath: string) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: settingsKeys.skillListed(project, filePath),
		queryFn: () => fetchListedSkill(project, filePath),
	});
};

/** Every file in one existing skill's folder. `undefined` (a new skill) reads nothing. */
export const useSkillFiles = (root: SkillRoot, name: string | undefined) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: settingsKeys.skillFiles(project, root, name ?? ""),
		queryFn: name === undefined ? skipToken : () => fetchSkillFiles(project, root, name),
	});
};

/** One bundled text file. The panel keeps its own draft, so a refetch never replaces typing. */
export const useSkillBundleFile = (root: SkillRoot, name: string, path: string) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: settingsKeys.skillFile(project, root, name, path),
		queryFn: () => fetchSkillBundleFile(project, root, name, path),
		gcTime: 0,
		refetchOnWindowFocus: false,
	});
};

/** What one declared package provides, as pi resolves it. */
export const usePackageResources = (source: string, scope: PackageView["scope"]) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: settingsKeys.packageResources(project, scope, source),
		queryFn: () => fetchPackageResources(project, source, scope),
	});
};
