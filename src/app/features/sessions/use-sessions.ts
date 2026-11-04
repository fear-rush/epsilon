import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { call, keepSubscribed, runStream } from "@/core/runtime";

/**
 * The chat list, and the stream that keeps it current.
 *
 * A change to any session file invalidates the one list query, so the sidebar refetches a
 * fresh order instead of patching rows in place. The catalog does the reconciling; this
 * only says "ask again".
 */
export const sessionsQuery = queryOptions({
	queryKey: ["sessions"],
	queryFn: ({ signal }) => call((client) => client["sessions.list"](), { signal }),
});

export function useSessions() {
	const queryClient = useQueryClient();

	useEffect(
		() =>
			keepSubscribed(() =>
				runStream(
					(client) => client["sessions.changes"](),
					() => {
						void queryClient.invalidateQueries({ queryKey: ["sessions"] });
					},
				),
			),
		[queryClient],
	);

	return useQuery(sessionsQuery);
}
