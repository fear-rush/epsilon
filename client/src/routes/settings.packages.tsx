import { createFileRoute } from "@tanstack/react-router";

import { SettingsGate } from "@/components/settings/settings-gate";
import { SettingsPackages } from "@/components/settings/settings-packages";
import { useSettings } from "@/hooks/use-settings";

export const Route = createFileRoute("/settings/packages")({
	component: function PackagesPage() {
		return <SettingsGate query={useSettings()} content={SettingsPackages} />;
	},
});
