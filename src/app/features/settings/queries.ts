import { queryOptions, skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

import type { McpScope } from "#protocol/settings/mcp";
import type { PackageScope } from "#protocol/settings/packages";
import type { SkillRoot } from "#protocol/settings/skills";
import { call } from "@/core/runtime";

import { settingsKeys } from "./keys.ts";
import { readProviderLogin } from "./providers/api.ts";
import { readSkill, readSkillDocument, readSkillRaw } from "./skills/api.ts";

/**
 * The one settings read: the snapshot the server assembles for a folder, or for the
 * home alone. Every section reads it, and a write invalidates the family.
 */
const SETTINGS_STALE_MS = 30_000;

export const settingsQuery = (project: string | undefined) =>
	queryOptions({
		queryKey: settingsKeys.snapshot(project),
		queryFn: ({ signal }) =>
			call((client) => client["settings.snapshot"]({ folder: project ?? null }), { signal }),
		staleTime: SETTINGS_STALE_MS,
	});

/**
 * The project the resource sections show beside the agent home, from the Settings URL,
 * or undefined for Global. Every settings read and write passes it on.
 */
export const useSettingsProject = (): string | undefined =>
	useSearch({ from: "/settings", select: (search) => search.project });

export const useSettings = () => useQuery(settingsQuery(useSettingsProject()));

/**
 * Re-read the snapshot after a write, and readiness with it: a new provider is what
 * makes the not-ready notice clear.
 */
export const useSettingsRefresh = (): (() => void) => {
	const queryClient = useQueryClient();
	return useCallback(() => {
		void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
		void queryClient.invalidateQueries({ queryKey: ["config", "readiness"] });
	}, [queryClient]);
};

/**
 * What one provider's sign-in last reported. A running flow streams its progress; this
 * read is the state a reloaded page comes back to, and the one a finished flow leaves.
 */
export const useProviderLogin = (providerId: string) =>
	useQuery({
		queryKey: settingsKeys.providerLogin(providerId),
		queryFn: () => readProviderLogin(providerId),
		staleTime: 0,
	});

/** The editable file of one skill. A new skill has no name yet, so it reads nothing. */
export const useSkill = (root: SkillRoot, name: string | undefined) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: [...settingsKeys.all, "skill", project ?? null, root, name ?? ""],
		queryFn: name === undefined ? skipToken : () => readSkill(project, root, name),
		staleTime: SETTINGS_STALE_MS,
	});
};

/** One skill's `SKILL.md` as text, for the Raw tab. */
export const useSkillRaw = (root: SkillRoot, name: string) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: [...settingsKeys.all, "skill-raw", project ?? null, root, name],
		queryFn: () => readSkillRaw(project, root, name),
		staleTime: 0,
	});
};

/** A listed skill, whoever owns it, read for display. */
export const useSkillDocument = (filePath: string | undefined) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: [...settingsKeys.all, "skill-document", project ?? null, filePath ?? ""],
		queryFn: filePath === undefined ? skipToken : () => readSkillDocument(project, filePath),
		staleTime: SETTINGS_STALE_MS,
	});
};

/** Every model pi composed, for the default-model picker and the settings controls. */
export const useModels = () => {
	return useQuery({
		queryKey: [...settingsKeys.all, "models"],
		queryFn: ({ signal }) => call((client) => client["settings.providers.models"](), { signal }),
		staleTime: SETTINGS_STALE_MS,
	});
};

/** What one declared package provides, as pi resolves it. */
export const usePackageResources = (source: string, scope: PackageScope) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: settingsKeys.packageResources(project, scope, source),
		queryFn: ({ signal }) =>
			call(
				(client) =>
					client["settings.packages.resources"]({ folder: project ?? null, scope, source }),
				{ signal },
			),
		staleTime: SETTINGS_STALE_MS,
	});
};

/** The packages pi's own check reports as outdated; the check runs npm or git. */
export const usePackageUpdates = () => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: settingsKeys.packageUpdates(project),
		queryFn: ({ signal }) =>
			call((client) => client["settings.packages.updates"]({ folder: project ?? null }), {
				signal,
			}),
		staleTime: SETTINGS_STALE_MS,
		refetchOnWindowFocus: false,
	});
};

/** Runs the update check again. Only a package write changes pi's answer. */
export const usePackageUpdatesRefresh = (): (() => void) => {
	const queryClient = useQueryClient();
	return useCallback(() => {
		void queryClient.invalidateQueries({ queryKey: [...settingsKeys.all, "package-updates"] });
	}, [queryClient]);
};

/** One MCP server's detail, read from the file its scope names. */
export const useMcpServer = (scope: McpScope, name: string) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: [...settingsKeys.all, "mcp", project ?? null, scope, name],
		queryFn: ({ signal }) =>
			call((client) => client["settings.mcp.read"]({ folder: project ?? null, name, scope }), {
				signal,
			}),
		staleTime: SETTINGS_STALE_MS,
	});
};

/** One MCP server's entry as text, for the Raw tab; stored values arrive masked. */
export const useMcpRaw = (scope: McpScope, name: string) => {
	const project = useSettingsProject();
	return useQuery({
		queryKey: [...settingsKeys.all, "mcp-raw", project ?? null, scope, name],
		queryFn: async ({ signal }) => {
			const answer = await call(
				(client) => client["settings.mcp.readRaw"]({ folder: project ?? null, name, scope }),
				{ signal },
			);
			return answer.text;
		},
		staleTime: SETTINGS_STALE_MS,
	});
};
