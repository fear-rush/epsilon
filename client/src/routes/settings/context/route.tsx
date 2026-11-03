import { createFileRoute } from "@tanstack/react-router";

import { ContextLayout } from "@/features/settings/context/context-panel";

export const Route = createFileRoute("/settings/context")({
	head: () => ({ meta: [{ title: "Context · Settings" }] }),
	component: ContextLayout,
});
