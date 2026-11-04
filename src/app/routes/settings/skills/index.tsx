import { createFileRoute } from "@tanstack/react-router";
import { SparklesIcon } from "lucide-react";

import { DetailPlaceholder } from "@/components/patterns/pane/detail-placeholder";

export const Route = createFileRoute("/settings/skills/")({
	component: () => <DetailPlaceholder icon={SparklesIcon} title="Select a skill" />,
});
