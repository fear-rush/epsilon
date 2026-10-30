import { createFileRoute } from "@tanstack/react-router";

import { ProviderEditor } from "@/features/settings/providers/provider-editor";

export const Route = createFileRoute("/settings/providers/new")({
	component: function NewProviderPage() {
		return <ProviderEditor />;
	},
});
