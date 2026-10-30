import { createFileRoute } from "@tanstack/react-router";

import { SettingsGeneral } from "@/features/settings/general/settings-general";
import { settingsPage } from "@/features/settings/shell/settings-page";

export const Route = createFileRoute("/settings/general")({
	component: settingsPage(SettingsGeneral),
});
