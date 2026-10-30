import { createFileRoute } from "@tanstack/react-router";

import { SettingsPackages } from "@/features/settings/packages";
import { settingsPage } from "@/features/settings/kit/settings-gate";

export const Route = createFileRoute("/settings/packages")({
	component: settingsPage(SettingsPackages),
});
