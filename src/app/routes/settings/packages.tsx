import { createFileRoute } from "@tanstack/react-router";

import { SettingsPackages } from "@/features/settings/packages/packages-page";

export const Route = createFileRoute("/settings/packages")({
	head: () => ({ meta: [{ title: "Packages · Settings" }] }),
	component: SettingsPackages,
});
