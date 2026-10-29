import { createFileRoute } from "@tanstack/react-router";

import { SettingsGate } from "@/components/settings/settings-gate";
import { SettingsSkills } from "@/components/settings/settings-skills";
import { useSettings } from "@/hooks/use-settings";

export const Route = createFileRoute("/settings/skills")({
	component: function SkillsPage() {
		return <SettingsGate query={useSettings()} content={SettingsSkills} />;
	},
});
