import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { toneText } from "./status-tone";
import type { StatusTone } from "./status-tone";

/** A small inline line with an icon, for a status beside a control. */
export function InlineStatus({
	icon: Icon,
	tone = "muted",
	children,
}: {
	icon: LucideIcon;
	tone?: StatusTone;
	children: ReactNode;
}) {
	return (
		<p className={toneText(tone, "flex min-w-0 items-center gap-1.5 text-meta")}>
			<Icon className="size-4 shrink-0" aria-hidden />
			<span className="min-w-0 truncate">{children}</span>
		</p>
	);
}
