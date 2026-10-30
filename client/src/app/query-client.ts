import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { reportRequestError } from "@/api/stale-contract";

// A failed request still reaches its own component; the caches only tell the
// shell when the failure means this page is older than the server.
export const queryClient = new QueryClient({
	queryCache: new QueryCache({ onError: reportRequestError }),
	mutationCache: new MutationCache({ onError: reportRequestError }),
});
