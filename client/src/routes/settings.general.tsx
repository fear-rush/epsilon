import { createFileRoute } from "@tanstack/react-router";

import { SettingsGeneral } from "@/features/settings/general";
import { settingsPage } from "@/features/settings/kit/settings-gate";

export const Route = createFileRoute("/settings/general")({
	component: settingsPage(SettingsGeneral),
});
