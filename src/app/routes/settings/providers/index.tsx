import { createFileRoute } from "@tanstack/react-router";
import { PlugIcon } from "lucide-react";

import { DetailPlaceholder } from "@/components/patterns/pane/detail-placeholder";

export const Route = createFileRoute("/settings/providers/")({
	component: () => <DetailPlaceholder icon={PlugIcon} title="Select a provider" />,
});
