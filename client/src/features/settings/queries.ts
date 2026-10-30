import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { McpScope } from "shared";

import { providerLoginKeys, readinessKeys, settingsKeys } from "@/api/keys";
import {
	fetchMcpServer,
	fetchProviderDetail,
	fetchProviderLogin,
	fetchSettings,
	fetchSkill,
} from "@/api/endpoints";

/**
 * The settings snapshot. Sections share one query key, so the page loads it
 * once and every write invalidates the same family.
 */
export const useSettings = () =>
	useQuery({ queryKey: settingsKeys.snapshot(), queryFn: fetchSettings });

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
export const useMcpServer = (scope: McpScope, name: string | undefined) =>
	useQuery({
		queryKey: settingsKeys.mcp(scope, name),
		queryFn: name === undefined ? skipToken : () => fetchMcpServer(scope, name),
	});

/** The editable detail of one user skill. `undefined` means a new one. */
export const useSkill = (name: string | undefined) =>
	useQuery({
		queryKey: settingsKeys.skill(name),
		queryFn: name === undefined ? skipToken : () => fetchSkill(name),
	});
