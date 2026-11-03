import { createFileRoute } from "@tanstack/react-router";

import { ContextSectionPage } from "@/features/settings/context/context-detail";
import { contextQuery } from "@/features/settings/queries";

export const Route = createFileRoute("/settings/context/$section")({
	loaderDeps: ({ search }) => ({ project: search.project }),
	// Warm the section's read before it mounts; the pane reports a failure in its own words.
	loader: async ({ context, deps }) => {
		await context.queryClient
			.query({ ...contextQuery(deps.project), staleTime: "static" })
			.catch(() => undefined);
	},
	component: function ContextPage() {
		const { section } = Route.useParams();
		return <ContextSectionPage id={section} />;
	},
	head: ({ params }) => ({ meta: [{ title: `${params.section} · Context · Settings` }] }),
});
