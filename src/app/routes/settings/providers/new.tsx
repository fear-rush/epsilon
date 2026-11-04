import { createFileRoute } from "@tanstack/react-router";

import { ProviderEditor } from "@/features/settings/providers/provider-editor";

export const Route = createFileRoute("/settings/providers/new")({
	head: () => ({ meta: [{ title: "New provider · Settings" }] }),
	component: () => <ProviderEditor />,
});
