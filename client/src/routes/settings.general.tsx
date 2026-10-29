import { createFileRoute } from "@tanstack/react-router";

import { SettingsGate } from "@/components/settings/settings-gate";
import { SettingsGeneral } from "@/components/settings/settings-general";
import { useSettings } from "@/hooks/use-settings";

export const Route = createFileRoute("/settings/general")({
	component: function GeneralPage() {
		return <SettingsGate query={useSettings()} content={SettingsGeneral} />;
	},
});
