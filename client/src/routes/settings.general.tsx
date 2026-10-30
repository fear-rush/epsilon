import { createFileRoute } from "@tanstack/react-router";

import { SettingsGeneral } from "@/features/settings/general";
import { SettingsPage } from "@/features/settings/kit/settings-page";

export const Route = createFileRoute("/settings/general")({
	component: () => <SettingsPage content={SettingsGeneral} />,
});
