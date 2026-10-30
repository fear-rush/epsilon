import { createFileRoute } from "@tanstack/react-router";

import { SettingsPackages } from "@/features/settings/packages/settings-packages";
import { settingsPage } from "@/features/settings/shell/settings-page";

export const Route = createFileRoute("/settings/packages")({
	component: settingsPage(SettingsPackages),
});
