import { createFileRoute } from "@tanstack/react-router";

import { SettingsSkills } from "@/components/settings/settings-skills";
import { settingsPage } from "@/components/settings/settings-page";

export const Route = createFileRoute("/settings/skills")({
	component: settingsPage(SettingsSkills),
});
