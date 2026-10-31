import { createFileRoute } from "@tanstack/react-router";

import { SkillEditor } from "@/features/settings/skills/skill-editor";
import { skillSearchSchema } from "@/features/settings/skills/skill-search";

export const Route = createFileRoute("/settings/skills/$name")({
	validateSearch: skillSearchSchema,
	component: function SkillPage() {
		const { name } = Route.useParams();
		const { root, path } = Route.useSearch();
		return <SkillEditor key={`${path ?? root}\0${name}`} name={name} root={root} path={path} />;
	},
});
