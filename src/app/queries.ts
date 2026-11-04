import { queryOptions } from "@tanstack/react-query";

import { agentHome, call } from "@/runtime";

/** The agent home this server runs, asked once: it changes only with the process. */
export const agentHomeQuery = queryOptions({
	queryKey: ["agent-home"],
	queryFn: () => agentHome(),
	staleTime: Infinity,
});

/**
 * One folder's trust status. The chat's gate and the projects page read the same entry,
 * so one trust decision refreshes both; `["config", "projects"]` is the prefix a write
 * invalidates.
 */
export const projectStatusQuery = (path: string) =>
	queryOptions({
		queryKey: ["config", "projects", path],
		queryFn: ({ signal }) =>
			call((client) => client["config.projects.status"]({ path }), { signal }),
	});
