import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { projectKeys, sessionKeys } from "@/api/keys";
import { fetchProjectStatus, fetchSessions, trustProject } from "@/api/endpoints";

/** pi's trust decision for one folder, read before anything attaches to it. */
export const useProjectStatus = (path: string) =>
	useQuery({ queryKey: projectKeys.status(path), queryFn: () => fetchProjectStatus(path) });

/** Trust a folder in pi's `trust.json`; the sidebar's badges read the same answer. */
export const useTrustProject = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: trustProject,
		onSuccess: (status) => {
			queryClient.setQueryData(projectKeys.status(status.path), status);
			void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
		},
	});
};

/** Folders that already hold sessions, newest first, for the folder dialog. */
export const useRecentProjects = () => {
	const sessions = useQuery({ queryKey: sessionKeys.all, queryFn: fetchSessions });
	return sessions.data?.projects.map((entry) => entry.project) ?? [];
};
