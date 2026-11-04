import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { toneText } from "./status-tone";
import type { Tone } from "./status-tone";

/**
 * The one centred state of a pane: loading, empty, error, offline or not found.
 * An icon, a title, one line and an optional action.
 */
export function StatusView({
	icon: Icon,
	title,
	line,
	tone = "neutral",
	action,
}: {
	icon: LucideIcon;
	title: string;
	line?: string;
	tone?: Tone;
	action?: ReactNode;
}) {
	return (
		<div className="flex h-full min-h-0 animate-enter-fade flex-col items-center justify-center gap-3 p-6 text-center">
			<Icon className={toneText(tone, "size-6")} aria-hidden />
			<div className="grid max-w-sm gap-1">
				<p className="text-section">{title}</p>
				{line !== undefined && <p className="text-meta text-muted-foreground">{line}</p>}
			</div>
			{action}
		</div>
	);
}
