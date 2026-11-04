import { createFileRoute } from "@tanstack/react-router";

import { ProviderEditor } from "@/features/settings/providers/provider-editor";

export const Route = createFileRoute("/settings/providers/$providerId")({
	head: () => ({ meta: [{ title: "Provider · Settings" }] }),
	component: ProviderRoute,
});

function ProviderRoute() {
	const { providerId } = Route.useParams();
	return <ProviderEditor providerId={providerId} />;
}
