/**
 * One row of a list that grows and collapses instead of popping in and out. The
 * starting style plays when React inserts the row, and `data-closing` holds it
 * while it closes; `useAnimatedRows` owns the timings.
 */
import type { ReactNode } from "react";

export function AnimatedRow({ closing, children }: { closing: boolean; children: ReactNode }) {
	return (
		<div className="settings-row-anim" data-closing={closing}>
			{children}
		</div>
	);
}
