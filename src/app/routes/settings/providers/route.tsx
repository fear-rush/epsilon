import { createFileRoute } from "@tanstack/react-router";

import { ProvidersLayout } from "@/features/settings/providers/providers-panel";

export const Route = createFileRoute("/settings/providers")({
	head: () => ({ meta: [{ title: "Providers · Settings" }] }),
	component: ProvidersLayout,
});
