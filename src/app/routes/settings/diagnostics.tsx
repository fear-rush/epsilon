import { createFileRoute } from "@tanstack/react-router";

import { SettingsDiagnostics } from "@/features/settings/diagnostics";

export const Route = createFileRoute("/settings/diagnostics")({
	head: () => ({ meta: [{ title: "Diagnostics · Settings" }] }),
	component: SettingsDiagnostics,
});
