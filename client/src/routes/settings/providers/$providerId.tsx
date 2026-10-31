import { createFileRoute } from "@tanstack/react-router";

import { ProviderEditor } from "@/features/settings/providers/provider-editor";
import { providerQuery, settingsQuery } from "@/features/settings/queries";

export const Route = createFileRoute("/settings/providers/$providerId")({
	loaderDeps: ({ search }) => ({ project: search.project }),
	// Warm the page's reads before it mounts; the pane reports a failure in its own words.
	loader: async ({ context, params, deps }) => {
		await Promise.all([
			context.queryClient.query({ ...settingsQuery(deps.project), staleTime: "static" }),
			context.queryClient.query({ ...providerQuery(params.providerId), staleTime: "static" }),
		]).catch(() => undefined);
	},
	component: function ProviderPage() {
		const { providerId } = Route.useParams();
		return <ProviderEditor providerId={providerId} />;
	},
	head: ({ params }) => ({
		meta: [{ title: `${params.providerId} · Providers · Settings` }],
	}),
});
