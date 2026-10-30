import { createFileRoute } from "@tanstack/react-router";

import { ProviderEditor } from "@/features/settings/providers/provider-editor";

export const Route = createFileRoute("/settings/providers/$providerId")({
	component: function ProviderPage() {
		const { providerId } = Route.useParams();
		return <ProviderEditor providerId={providerId} />;
	},
});
