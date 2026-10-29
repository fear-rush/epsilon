import { createFileRoute } from "@tanstack/react-router";

import { SettingsPackages } from "@/components/settings/settings-packages";
import { settingsPage } from "@/components/settings/settings-page";

export const Route = createFileRoute("/settings/packages")({
	component: settingsPage(SettingsPackages),
});
