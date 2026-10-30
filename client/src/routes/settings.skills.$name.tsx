import { createFileRoute } from "@tanstack/react-router";

import { SkillEditor } from "@/features/settings/skills/skill-editor";

export const Route = createFileRoute("/settings/skills/$name")({
	component: function SkillPage() {
		const { name } = Route.useParams();
		return <SkillEditor name={name} />;
	},
});
