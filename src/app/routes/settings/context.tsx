import { createFileRoute } from "@tanstack/react-router";

import { SectionPending } from "@/features/settings/shell/section-pending";

export const Route = createFileRoute("/settings/context")({
	head: () => ({ meta: [{ title: "Context · Settings" }] }),
	component: () => <SectionPending title="Context" />,
});
