import { createFileRoute } from "@tanstack/react-router";
import { PackageIcon } from "lucide-react";

import { DetailPlaceholder } from "@/components/patterns/pane/detail-placeholder";
import { useSettings } from "@/features/settings/queries";

export const Route = createFileRoute("/settings/packages/")({
	component: Placeholder,
});

function Placeholder() {
	const settings = useSettings();
	return (
		<DetailPlaceholder
			icon={PackageIcon}
			title="Select a package"
			hasItems={(settings.data?.packages.packages.length ?? 0) > 0}
		/>
	);
}
