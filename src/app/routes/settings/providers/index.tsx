import { createFileRoute } from "@tanstack/react-router";
import { PlugIcon } from "lucide-react";

import { DetailPlaceholder } from "@/components/patterns/pane/detail-placeholder";
import { useSettings } from "@/features/settings/queries";

export const Route = createFileRoute("/settings/providers/")({
	component: Placeholder,
});

function Placeholder() {
	const settings = useSettings();
	return (
		<DetailPlaceholder
			icon={PlugIcon}
			title="Select a provider"
			hasItems={(settings.data?.providers.providers.length ?? 0) > 0}
		/>
	);
}
