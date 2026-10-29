import { createFileRoute } from "@tanstack/react-router";

import { SettingsGate } from "@/components/settings/settings-gate";
import { SettingsMcp } from "@/components/settings/settings-mcp";
import { useSettings } from "@/hooks/use-settings";

export const Route = createFileRoute("/settings/mcp")({
	component: function McpPage() {
		return <SettingsGate query={useSettings()} content={SettingsMcp} />;
	},
});
