import type { ReactNode } from "react";

import { Marker, MarkerContent } from "@/components/ui/marker";

/**
 * A point in the conversation a reader can return to. Epsilon uses it where pi recorded
 * a compaction or a branch summary: the label says what happened, and an action may sit
 * beside it.
 */
export function Checkpoint({ label, children }: { label: string; children?: ReactNode }) {
	return (
		<Marker variant="separator">
			<MarkerContent className="inline-flex items-center gap-2">
				{label}
				{children}
			</MarkerContent>
		</Marker>
	);
}
