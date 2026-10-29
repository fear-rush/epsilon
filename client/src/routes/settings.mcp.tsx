import { createFileRoute } from "@tanstack/react-router";

import { SettingsMcp } from "@/components/settings/settings-mcp";
import { settingsPage } from "@/components/settings/settings-page";

export const Route = createFileRoute("/settings/mcp")({
	component: settingsPage(SettingsMcp),
});
