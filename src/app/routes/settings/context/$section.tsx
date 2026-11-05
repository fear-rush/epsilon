import { createFileRoute } from "@tanstack/react-router";

import { ContextSectionPage } from "@/features/settings/context/context-detail";

export const Route = createFileRoute("/settings/context/$section")({
	component: ContextPage,
	head: ({ params }) => ({ meta: [{ title: `${params.section} · Context · Settings` }] }),
});

function ContextPage() {
	const { section } = Route.useParams();
	return <ContextSectionPage id={section} />;
}
