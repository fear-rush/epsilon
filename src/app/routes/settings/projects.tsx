import { createFileRoute } from "@tanstack/react-router";

import { SettingsProjects } from "@/features/settings/projects/projects-page";

export const Route = createFileRoute("/settings/projects")({
	head: () => ({ meta: [{ title: "Projects · Settings" }] }),
	component: SettingsProjects,
});
