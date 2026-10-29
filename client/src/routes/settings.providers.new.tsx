import { createFileRoute } from "@tanstack/react-router";

import { ProviderEditor } from "@/components/settings/providers/provider-editor";

export const Route = createFileRoute("/settings/providers/new")({
	component: function NewProviderPage() {
		return <ProviderEditor />;
	},
});
