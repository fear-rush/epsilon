import { createFileRoute } from "@tanstack/react-router";

import { PackageDetail } from "@/features/settings/packages/package-detail";
import { scopeOfSegment } from "@/features/settings/packages/package-kind";
import { packageResourcesQuery, settingsQuery } from "@/features/settings/queries";

export const Route = createFileRoute("/settings/packages/$scope/$source")({
	loaderDeps: ({ search }) => ({ project: search.project }),
	// Warm the page's reads before it mounts; the pane reports a failure in its own words.
	loader: async ({ context, params, deps }) => {
		await Promise.all([
			context.queryClient.query({ ...settingsQuery(deps.project), staleTime: "static" }),
			context.queryClient.query({
				...packageResourcesQuery(deps.project, params.source, scopeOfSegment(params.scope)),
				staleTime: "static",
			}),
		]).catch(() => undefined);
	},
	component: function PackagePage() {
		const { scope, source } = Route.useParams();
		return (
			<PackageDetail key={`${scope}\0${source}`} scope={scopeOfSegment(scope)} source={source} />
		);
	},
	head: ({ params }) => ({
		meta: [{ title: `${params.source} · Packages · Settings` }],
	}),
});
