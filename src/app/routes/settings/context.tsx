import { createFileRoute } from "@tanstack/react-router";

import { SettingsContext } from "@/features/settings/context/context-page";

export const Route = createFileRoute("/settings/context")({
	head: () => ({ meta: [{ title: "Context · Settings" }] }),
	component: SettingsContext,
});
