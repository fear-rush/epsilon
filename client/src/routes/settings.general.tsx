import { createFileRoute } from "@tanstack/react-router";

import { SettingsGeneral } from "@/components/settings/settings-general";
import { settingsPage } from "@/components/settings/settings-page";

export const Route = createFileRoute("/settings/general")({
	component: settingsPage(SettingsGeneral),
});
