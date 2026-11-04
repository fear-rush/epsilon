import { createFileRoute } from "@tanstack/react-router";

import { PackageDetail } from "@/features/settings/packages/package-detail";
import { scopeOfSegment } from "@/features/settings/packages/package-kind";

export const Route = createFileRoute("/settings/packages/$scope/$source")({
	head: () => ({ meta: [{ title: "Package · Settings" }] }),
	component: PackageRoute,
});

function PackageRoute() {
	const { scope, source } = Route.useParams();
	return <PackageDetail scope={scopeOfSegment(scope)} source={source} />;
}
