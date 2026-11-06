import { createFileRoute } from "@tanstack/react-router";
import { SparklesIcon } from "lucide-react";

import { DetailPlaceholder } from "@/components/patterns/pane/detail-placeholder";
import { useSettings } from "@/features/settings/queries";

export const Route = createFileRoute("/settings/skills/")({
	component: Placeholder,
});

function Placeholder() {
	const settings = useSettings();
	return (
		<DetailPlaceholder
			icon={SparklesIcon}
			title="Select a skill"
			hasItems={
				(settings.data?.skills.skills.length ?? 0) +
					(settings.data?.skills.foreignSkills.length ?? 0) >
				0
			}
		/>
	);
}
