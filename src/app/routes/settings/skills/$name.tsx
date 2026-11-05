import { createFileRoute } from "@tanstack/react-router";

import { SkillEditor } from "@/features/settings/skills/skill-editor";

export const Route = createFileRoute("/settings/skills/$name")({
	head: () => ({ meta: [{ title: "Skill · Settings" }] }),
	component: SkillRoute,
});

function SkillRoute() {
	const { name } = Route.useParams();
	const { path, root } = Route.useSearch();
	return <SkillEditor key={`${path ?? root}\0${name}`} name={name} path={path} root={root} />;
}
