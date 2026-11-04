import { createFileRoute } from "@tanstack/react-router";
import { PackageIcon } from "lucide-react";

import { DetailPlaceholder } from "@/components/patterns/pane/detail-placeholder";

export const Route = createFileRoute("/settings/packages/")({
	component: () => <DetailPlaceholder icon={PackageIcon} title="Select a package" />,
});
