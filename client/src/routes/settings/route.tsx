/**
 * Settings is its own surface: full page, its own navigation, no modal. The root
 * route hides the session sidebar for this path. `project` names the trusted
 * project whose `.pi` the resource sections show beside the home; it stays in
 * the URL across every settings link, so a reload or a shared link keeps it.
 */
import { createFileRoute, Outlet, retainSearchParams } from "@tanstack/react-router";
import { z } from "zod";

import { SettingsShell } from "@/features/settings/shell/settings-shell";

const searchSchema = z.object({ project: z.string().min(1).optional().catch(undefined) });

export const Route = createFileRoute("/settings")({
	head: () => ({ meta: [{ title: "Settings · Epsilon" }] }),
	validateSearch: searchSchema,
	search: { middlewares: [retainSearchParams(["project"])] },
	component: function SettingsLayout() {
		return (
			<SettingsShell>
				<Outlet />
			</SettingsShell>
		);
	},
});
