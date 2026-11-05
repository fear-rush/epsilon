import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ProjectTrustAction } from "#protocol/settings/projects";
import { projectStatusQuery } from "@/core/queries";
import { call } from "@/core/runtime";

/** pi's trust decision for one folder, read before anything attaches to it. */
export const useProjectStatus = (path: string) => useQuery(projectStatusQuery(path));

/**
 * Trust a folder in pi's `trust.json`, or change the decision it already holds.
 *
 * The socket keeps no project cache of its own: each status is a query under
 * `["config", "projects"]`, so invalidating that prefix refreshes the chat gate, the
 * sidebar and the settings list together.
 */
export function useSetProjectTrust() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ action, path }: { action: ProjectTrustAction; path: string }) =>
			call((client) => client["settings.projects.setTrust"]({ action, path })),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["config", "projects"] });
			void queryClient.invalidateQueries({ queryKey: ["sessions"] });
		},
	});
}
