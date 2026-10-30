import { createFileRoute } from "@tanstack/react-router";

import { MasterDetailPlaceholder } from "@/features/settings/kit/master-detail-layout";

export const Route = createFileRoute("/settings/providers/")({
	component: () => (
		<MasterDetailPlaceholder>
			Select a provider on the left, or add one below the list.
		</MasterDetailPlaceholder>
	),
});
