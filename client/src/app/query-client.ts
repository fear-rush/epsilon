import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { StaleContractError } from "@/api/client";
import { reportRequestError } from "@/api/stale-contract";

/** TanStack's default attempts, except for a stale contract: a retry cannot fix it. */
const MAX_RETRIES = 3;

// A failed request still reaches its own component; the caches only tell the
// shell when the failure means this page is older than the server.
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: (failures, error) => !(error instanceof StaleContractError) && failures < MAX_RETRIES,
		},
	},
	queryCache: new QueryCache({ onError: reportRequestError }),
	mutationCache: new MutationCache({ onError: reportRequestError }),
});
