import { useQuery } from "@tanstack/react-query";

import { readinessKeys } from "@/api/keys";
import { fetchReadiness } from "@/lib/api";

/**
 * Whether the deployment can run a turn, read from REST. The settings panel
 * invalidates this query after a change, and the interval catches a file edited
 * in a terminal in the same deployment.
 */
const READINESS_REFRESH_MS = 5_000;

export function useReadiness(options: { enabled?: boolean } = {}) {
	return useQuery({
		queryKey: readinessKeys.all,
		queryFn: fetchReadiness,
		refetchInterval: READINESS_REFRESH_MS,
		enabled: options.enabled ?? true,
	});
}
