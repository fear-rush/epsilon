import { useQuery } from "@tanstack/react-query";
import { readinessSchema } from "shared";
import type { Readiness } from "shared";

/**
 * Whether the deployment can run a turn, read from REST. A login happens in a
 * shell, not here, so the answer is re-read on an interval: the notice clears
 * itself once the operator has run the step it names.
 */
const READINESS_REFRESH_MS = 5_000;

const fetchReadiness = async (): Promise<Readiness> => {
	const response = await fetch("/api/readiness");
	if (!response.ok) throw new Error(`Readiness came back with ${response.status}`);
	return readinessSchema.parse(await response.json());
};

export function useReadiness() {
	return useQuery({
		queryKey: ["readiness"],
		queryFn: fetchReadiness,
		refetchInterval: READINESS_REFRESH_MS,
	});
}
