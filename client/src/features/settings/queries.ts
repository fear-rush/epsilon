import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import type { McpScope } from "shared";

import { readinessKeys, settingsKeys } from "@/api/keys";
import { fetchMcpServer, fetchProviderDetail, fetchSettings, fetchSkill } from "@/api/endpoints";

/**
 * The settings snapshot. Sections share one query key, so the page loads it
 * once and every write invalidates the same family.
 */
export const useSettings = () =>
	useQuery({ queryKey: settingsKeys.snapshot(), queryFn: fetchSettings });

/**
 * Re-read the settings snapshot after a write, and the readiness answer with it:
 * adding a provider is what makes the not-ready notice clear.
 */
export const useSettingsRefresh = (): (() => void) => {
	const queryClient = useQueryClient();
	return () => {
		void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
		void queryClient.invalidateQueries({ queryKey: readinessKeys.all });
	};
};

/** The editable detail of one provider. `undefined` means a new, unsaved one. */
export const useProviderDetail = (providerId: string | undefined) =>
	useQuery({
		queryKey: settingsKeys.provider(providerId),
		queryFn: providerId === undefined ? skipToken : () => fetchProviderDetail(providerId),
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
