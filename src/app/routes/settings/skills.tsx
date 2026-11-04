import { createFileRoute } from "@tanstack/react-router";

import { SectionPending } from "@/features/settings/shell/section-pending";

export const Route = createFileRoute("/settings/skills")({
	head: () => ({ meta: [{ title: "Skills · Settings" }] }),
	component: () => <SectionPending title="Skills" />,
});
