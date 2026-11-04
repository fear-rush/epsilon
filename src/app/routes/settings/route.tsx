import { createFileRoute, Outlet } from "@tanstack/react-router";
/**
 * Settings is its own surface: full page, its own navigation, no modal. The root route
 * puts no session shell around it, so Back to app is the way out.
 */
import { Schema } from "effect";

import { SettingsShell } from "@/features/settings/shell/settings-shell";

/** The project a resource section reads beside the agent home; absent means Global. */
const Search = Schema.Struct({ project: Schema.optional(Schema.NonEmptyString) });

export const Route = createFileRoute("/settings")({
	head: () => ({ meta: [{ title: "Settings · Epsilon" }] }),
	validateSearch: Schema.toStandardSchemaV1(Search),
	component: SettingsLayout,
});

function SettingsLayout() {
	return (
		<SettingsShell>
			<Outlet />
		</SettingsShell>
	);
}
