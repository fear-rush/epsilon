import { createFileRoute } from "@tanstack/react-router";

import { MasterDetailPlaceholder } from "@/features/settings/kit/master-detail-layout";

export const Route = createFileRoute("/settings/skills/")({
	component: () => (
		<MasterDetailPlaceholder>
			Select a skill on the left, or add one below the list.
		</MasterDetailPlaceholder>
	),
});
