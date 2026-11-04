import { createFileRoute } from "@tanstack/react-router";

import { SettingsSkills } from "@/features/settings/skills/skills-page";

export const Route = createFileRoute("/settings/skills")({
	head: () => ({ meta: [{ title: "Skills · Settings" }] }),
	component: SettingsSkills,
});
