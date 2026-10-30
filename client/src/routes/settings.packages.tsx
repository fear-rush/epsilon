import { createFileRoute } from "@tanstack/react-router";

import { SettingsPackages } from "@/features/settings/packages";
import { SettingsPage } from "@/features/settings/kit/settings-page";

export const Route = createFileRoute("/settings/packages")({
	component: () => <SettingsPage content={SettingsPackages} />,
});
