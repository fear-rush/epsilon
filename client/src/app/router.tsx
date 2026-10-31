import { createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";

import { routeTree } from "@/routeTree.gen";

import { queryClient } from "./query-client";
import { RouteError } from "./route-error";
import { RouteNotFound } from "./route-not-found";
import { RoutePending } from "./route-pending";

/**
 * The router owns the address; TanStack Query owns the reads. A route loader
 * warms the cache before its page renders, and intent preloading lets a hover do
 * it first.
 */
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
	// The cache is part of the router's own tree, so a route never needs to import the client.
	Wrap: ({ children }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	),
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
