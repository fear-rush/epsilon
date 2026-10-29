/**
 * Settings is its own surface: full page, its own navigation, no modal. The root
 * route hides the session sidebar for this path.
 */
import { createFileRoute, Outlet } from "@tanstack/react-router";

import { SettingsShell } from "@/components/settings/settings-shell";

export const Route = createFileRoute("/settings")({
	component: function SettingsLayout() {
		return (
			<SettingsShell>
				<Outlet />
			</SettingsShell>
		);
	},
});
