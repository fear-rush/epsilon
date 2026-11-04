import { queryOptions } from "@tanstack/react-query";

import { agentHome } from "@/runtime";

/** The agent home this server runs, asked once: it changes only with the process. */
export const agentHomeQuery = queryOptions({
	queryKey: ["agent-home"],
	queryFn: () => agentHome(),
	staleTime: Infinity,
});
