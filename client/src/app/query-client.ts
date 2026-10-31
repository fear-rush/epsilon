import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { RefusalError, StaleContractError } from "@/api/client";
import { reportRequestError } from "@/api/stale-contract";

/** TanStack's default attempts, except where a retry cannot change the answer. */
const MAX_RETRIES = 3;

/** A refusal the server decided (4xx) is an answer, not a transient failure. */
const retryable = (error: Error): boolean =>
	!(error instanceof StaleContractError) && !(error instanceof RefusalError && error.status < 500);

// A failed request still reaches its own component; the caches only tell the
// shell when the failure means this page is older than the server.
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: (failures, error) => retryable(error) && failures < MAX_RETRIES,
		},
	},
	queryCache: new QueryCache({ onError: reportRequestError }),
	mutationCache: new MutationCache({ onError: reportRequestError }),
});
