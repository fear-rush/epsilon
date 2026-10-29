import { useQuery } from "@tanstack/react-query";
import { readinessSchema } from "shared";
import type { Readiness } from "shared";

/**
 * Whether the deployment can run a turn, read from REST. The settings panel
 * invalidates this query after a change, and the interval catches a file edited
 * in a terminal in the same deployment.
 */
const READINESS_REFRESH_MS = 5_000;

const fetchReadiness = async (): Promise<Readiness> => {
	const response = await fetch("/api/readiness");
	if (!response.ok) throw new Error(`Readiness came back with ${response.status}`);
	return readinessSchema.parse(await response.json());
};

export function useReadiness(options: { enabled?: boolean } = {}) {
	return useQuery({
		queryKey: ["readiness"],
		queryFn: fetchReadiness,
		refetchInterval: READINESS_REFRESH_MS,
		enabled: options.enabled ?? true,
	});
}
