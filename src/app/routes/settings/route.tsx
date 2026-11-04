/**
 * Settings is its own surface: full page, its own navigation, no modal. The root route
 * puts no session shell around it, so Back to app is the way out.
 */
import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SettingsShell } from "@/features/settings/shell/settings-shell";

export const Route = createFileRoute("/settings")({
	head: () => ({ meta: [{ title: "Settings · Epsilon" }] }),
	component: SettingsLayout,
});

function SettingsLayout() {
	return (
		<SettingsShell>
			<Outlet />
		</SettingsShell>
	);
}
