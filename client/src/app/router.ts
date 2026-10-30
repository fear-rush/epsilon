import { createRouter } from "@tanstack/react-router";

import { routeTree } from "@/routeTree.gen";

import { RouteError } from "./route-error";

export const router = createRouter({ routeTree, defaultErrorComponent: RouteError });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
