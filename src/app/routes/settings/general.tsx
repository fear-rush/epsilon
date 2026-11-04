import { createFileRoute } from "@tanstack/react-router";

import { SettingsGeneral } from "@/features/settings/general/general";

export const Route = createFileRoute("/settings/general")({
	head: () => ({ meta: [{ title: "General · Settings" }] }),
	component: SettingsGeneral,
});
