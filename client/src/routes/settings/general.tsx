import { createFileRoute } from "@tanstack/react-router";

import { SettingsGeneral } from "@/features/settings/general/general";
import { settingsQuery } from "@/features/settings/queries";

export const Route = createFileRoute("/settings/general")({
	head: () => ({ meta: [{ title: "General · Settings" }] }),
	loaderDeps: ({ search }) => ({ project: search.project }),
	// Warm the page's read before it mounts; the pane reports a failure in its own words.
	loader: async ({ context, deps }) => {
		await context.queryClient
			.query({ ...settingsQuery(deps.project), staleTime: "static" })
			.catch(() => undefined);
	},
	component: SettingsGeneral,
});
