import { createFileRoute } from "@tanstack/react-router";

import { PackageDetail } from "@/features/settings/packages/package-detail";

export const Route = createFileRoute("/settings/packages/$scope/$source")({
	component: function PackagePage() {
		const { scope, source } = Route.useParams();
		// Any scope that is not the project's is the home's, as the list links them.
		return (
			<PackageDetail
				key={`${scope}\0${source}`}
				scope={scope === "project" ? "project" : "user"}
				source={source}
			/>
		);
	},
});
