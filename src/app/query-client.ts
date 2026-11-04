import { QueryClient } from "@tanstack/react-query";

import { isTemporaryFailure } from "./errors.ts";

/**
 * The cache, not the source of truth.
 *
 * A pushed change invalidates a family; a refused answer is not retried, because the same
 * request would be refused again. Only a closed socket is worth waiting out, and a
 * reconnection invalidates everything, so nothing stays stale after a drop.
 */

const MAX_RETRIES = 3;
const FIRST_DELAY_MS = 500;
const MAX_DELAY_MS = 5_000;

/** Long enough that moving between two pages does not re-read the same files. */
const STALE_MS = 30_000;

/** Exponential, but bounded so a long outage does not turn into a minute between tries. */
const retryDelay = (attempt: number): number =>
	Math.min(FIRST_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: (failures, error) => isTemporaryFailure(error) && failures < MAX_RETRIES,
			retryDelay,
			staleTime: STALE_MS,
		},
		mutations: { retry: false },
	},
});
