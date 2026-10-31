import type { QueryClient } from "@tanstack/react-query";

/** What a route reads from its `context`: the one Query cache, warmed by loaders. */
export type RouterContext = { queryClient: QueryClient };
