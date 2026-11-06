import { createFileRoute } from "@tanstack/react-router";
import { ServerIcon } from "lucide-react";

import { DetailPlaceholder } from "@/components/patterns/pane/detail-placeholder";
import { useSettings, useSettingsProject } from "@/features/settings/queries";

export const Route = createFileRoute("/settings/mcp/")({
	component: Placeholder,
});

function Placeholder() {
	const settings = useSettings();
	const scope = useSettingsProject() === undefined ? "global" : "project";
	return (
		<DetailPlaceholder
			icon={ServerIcon}
			title="Select a server"
			hasItems={
				(settings.data?.mcp.servers.filter((server) => server.scope === scope).length ?? 0) > 0
			}
		/>
	);
}
