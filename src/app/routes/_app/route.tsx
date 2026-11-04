/**
 * A pathless layout: it adds no segment to the URL. Everything under it shares the chat
 * column and the readiness gate; `/settings` sits beside it as its own surface.
 *
 * The three route states are mounted here, so a page that crashes or an address that names
 * nothing renders inside the shell and the sidebar stays. The router's defaults remain the
 * last resort for a page outside every layout.
 */
import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/core/route-error";
import { RouteNotFound } from "@/core/route-not-found";
import { RoutePending } from "@/core/route-pending";
import { AppShell } from "@/features/app-shell/app-shell";

export const Route = createFileRoute("/_app")({
	component: AppShell,
	errorComponent: RouteError,
	notFoundComponent: RouteNotFound,
	pendingComponent: RoutePending,
});
