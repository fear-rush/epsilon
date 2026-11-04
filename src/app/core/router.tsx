import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

import { routeTree } from "../routeTree.gen.ts";
import { queryClient } from "./query-client.ts";
import { RouteError } from "./route-error.tsx";
import { RouteNotFound } from "./route-not-found.tsx";
import { RoutePending } from "./route-pending.tsx";

/**
 * The router owns the address; TanStack Query owns the reads. A route loader warms the
 * cache before its page renders, and intent preloading lets a hover do it first.
 *
 * The cache is part of the router's own tree, so a route reaches it through the context
 * instead of importing the client.
 */
export type RouterContext = { readonly queryClient: typeof queryClient };

export const router = createRouter({
	routeTree,
	context: { queryClient },
	defaultErrorComponent: RouteError,
	defaultPendingComponent: RoutePending,
	defaultNotFoundComponent: RouteNotFound,
	defaultPreload: "intent",
	// Query decides staleness, so a preloaded loader result must not look fresh to the router.
	defaultPreloadStaleTime: 0,
	// A selector that returns an equal object must not re-render the component.
	defaultStructuralSharing: true,
	Wrap: ({ children }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	),
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
