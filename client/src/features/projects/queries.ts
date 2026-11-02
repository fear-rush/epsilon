import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { projectKeys, sessionKeys } from "@/api/keys";
import { fetchProjectStatus, fetchSessions, setProjectTrust } from "@/api/endpoints";
import type { ProjectTrustAction } from "@/api/types";

/** pi's trust decision for one folder, read before anything attaches to it. */
export const useProjectStatus = (path: string) =>
	useQuery({
		queryKey: projectKeys.status(path),
		queryFn: ({ signal }) => fetchProjectStatus(path, signal),
	});

/** Trust a folder in pi's `trust.json`, or change the decision it already holds. */
export const useSetProjectTrust = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ path, action }: { path: string; action: ProjectTrustAction }) =>
			setProjectTrust(path, action),
		onSuccess: (status, { path }) => {
			// The server answers with the resolved folder, which differs from the path
			// in the URL when a parent is a symlink (`/var` -> `/private/var`). Both keys
			// read the same answer, so the gate that asked with the URL path sees it too.
			queryClient.setQueryData(projectKeys.status(path), status);
			queryClient.setQueryData(projectKeys.status(status.path), status);
			void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
		},
	});
};

/** Folders that already hold sessions, newest first, for the folder dialog. */
export const useRecentProjects = () => {
	const sessions = useQuery({
		queryKey: sessionKeys.all,
		queryFn: ({ signal }) => fetchSessions(signal),
	});
	return sessions.data?.projects.map((entry) => entry.project) ?? [];
};
