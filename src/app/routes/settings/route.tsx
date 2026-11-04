import { createFileRoute, Outlet } from "@tanstack/react-router";
/**
 * Settings is its own surface: full page, its own navigation, no modal. The root route
 * puts no session shell around it, so Back to app is the way out.
 *
 * Its crashes and unknown addresses render inside this layout, so the navigation stays and
 * the reader can leave for another section.
 */
import { Schema } from "effect";

import { RouteError } from "@/core/route-error";
import { RouteNotFound } from "@/core/route-not-found";
import { RoutePending } from "@/core/route-pending";
import { SettingsShell } from "@/features/settings/shell/settings-shell";

/** The project a resource section reads beside the agent home; absent means Global. */
const Search = Schema.Struct({ project: Schema.optional(Schema.NonEmptyString) });

export const Route = createFileRoute("/settings")({
	head: () => ({ meta: [{ title: "Settings · Epsilon" }] }),
	validateSearch: Schema.toStandardSchemaV1(Search),
	component: SettingsLayout,
	errorComponent: RouteError,
	notFoundComponent: RouteNotFound,
	pendingComponent: RoutePending,
});

function SettingsLayout() {
	return (
		<SettingsShell>
			<Outlet />
		</SettingsShell>
	);
}
