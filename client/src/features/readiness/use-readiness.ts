import { useQuery } from "@tanstack/react-query";

import { readinessKeys } from "@/api/keys";
import { fetchReadiness } from "@/api/endpoints";

/**
 * Whether Epsilon can run a turn, read from REST. The settings panel
 * invalidates this query after a change, and the interval catches a file edited
 * in a terminal using the same agent home.
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
