import { createFileRoute } from "@tanstack/react-router";
import { PuzzleIcon } from "lucide-react";

import { DetailPlaceholder } from "@/components/patterns/pane/detail-placeholder";

export const Route = createFileRoute("/settings/skills/")({
	component: () => <DetailPlaceholder icon={PuzzleIcon} title="Select a skill" />,
});
