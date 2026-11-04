import { createFileRoute } from "@tanstack/react-router";

import { SettingsProviders } from "@/features/settings/providers/providers";

export const Route = createFileRoute("/settings/providers")({
	head: () => ({ meta: [{ title: "Providers · Settings" }] }),
	component: SettingsProviders,
});
