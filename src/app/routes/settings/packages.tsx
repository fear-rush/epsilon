import { createFileRoute } from "@tanstack/react-router";

import { SectionPending } from "@/features/settings/shell/section-pending";

export const Route = createFileRoute("/settings/packages")({
	head: () => ({ meta: [{ title: "Packages · Settings" }] }),
	component: () => <SectionPending title="Packages" />,
});
