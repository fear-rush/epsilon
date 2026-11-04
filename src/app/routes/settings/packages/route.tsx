import { createFileRoute } from "@tanstack/react-router";

import { PackagesLayout } from "@/features/settings/packages/packages-panel";

export const Route = createFileRoute("/settings/packages")({
	head: () => ({ meta: [{ title: "Packages · Settings" }] }),
	component: PackagesLayout,
});
