import { createFileRoute } from "@tanstack/react-router";

import { ProviderEditor } from "@/features/settings/providers/provider-editor";
import { settingsQuery } from "@/features/settings/queries";

export const Route = createFileRoute("/settings/providers/new")({
	head: () => ({ meta: [{ title: "New provider · Settings" }] }),
	loaderDeps: ({ search }) => ({ project: search.project }),
	// Warm the page's read before it mounts; the pane reports a failure in its own words.
	loader: async ({ context, deps }) => {
		await context.queryClient
			.query({ ...settingsQuery(deps.project), staleTime: "static" })
			.catch(() => undefined);
	},
	component: function NewProviderPage() {
		return <ProviderEditor />;
	},
});
