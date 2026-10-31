import { createFileRoute } from "@tanstack/react-router";

import { SkillEditor } from "@/features/settings/skills/skill-editor";
import { skillSearchSchema } from "@/features/settings/skills/skill-search";

export const Route = createFileRoute("/settings/skills/new")({
	validateSearch: skillSearchSchema,
	component: function NewSkillPage() {
		const { root } = Route.useSearch();
		return <SkillEditor key={root} root={root} />;
	},
});
