import type { LucideIcon } from "lucide-react";

import { StatusView } from "@/components/patterns/status/status-view";
import { DetailPage } from "./detail-page";

/**
 * The detail column while nothing is selected: the bar stays so the columns
 * line up, and the hint sits in the middle of the pane.
 */
export function DetailPlaceholder({ icon, title }: { icon: LucideIcon; title: string }) {
	return (
		<DetailPage title="" fill>
			<StatusView icon={icon} title={title} />
		</DetailPage>
	);
}
