import { createFileRoute } from "@tanstack/react-router";

import { SectionPending } from "@/features/settings/shell/section-pending";

export const Route = createFileRoute("/settings/providers")({
	head: () => ({ meta: [{ title: "Providers · Settings" }] }),
	component: () => <SectionPending title="Providers" />,
});
