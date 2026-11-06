import type { LucideIcon } from "lucide-react";

import { StatusView } from "@/components/patterns/status/status-view";

import { DetailPage } from "./detail-page";

/**
 * The detail column while nothing is selected: the bar stays so the columns
 * line up, and the hint sits in the middle of the pane, only when there is something to select.
 */
export function DetailPlaceholder({
	icon,
	title,
	hasItems,
}: {
	icon: LucideIcon;
	title: string;
	/** The list has something to select; without it the column stays blank. */
	hasItems: boolean;
}) {
	return (
		<DetailPage title="" fill>
			{hasItems ? <StatusView icon={icon} title={title} /> : null}
		</DetailPage>
	);
}
