import { createFileRoute } from "@tanstack/react-router";

import { SkillEditor } from "@/features/settings/skills/skill-editor";

export const Route = createFileRoute("/settings/skills/new")({
	head: () => ({ meta: [{ title: "New skill · Settings" }] }),
	component: NewSkillRoute,
});

function NewSkillRoute() {
	const { project, root } = Route.useSearch();
	return <SkillEditor root={root ?? (project === undefined ? "home" : "project-agents")} />;
}
