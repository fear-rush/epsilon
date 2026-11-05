import { createFileRoute } from "@tanstack/react-router";
import { BookOpenIcon } from "lucide-react";

import { DetailPlaceholder } from "@/components/patterns/pane/detail-placeholder";

export const Route = createFileRoute("/settings/context/")({
	component: () => (
		<DetailPlaceholder icon={BookOpenIcon} title="Select a section of the context" />
	),
});
