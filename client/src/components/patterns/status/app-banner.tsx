import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** The tones of the strip at the top of the app. */
export type BannerTone = "warning" | "destructive" | "info";

const TONE: Record<BannerTone, string> = {
	warning: "bg-warning/15 text-warning-foreground dark:text-warning",
	destructive: "bg-destructive/10 text-destructive",
	info: "bg-info/10 text-info",
};

/**
 * The one strip at the top of the app for connection and version problems, so no
 * pane repeats them. One line and an optional action.
 */
export function AppBanner({
	tone,
	action,
	children,
}: {
	tone: BannerTone;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div
			role="status"
			className={cn(
				"flex w-full shrink-0 items-center justify-center gap-3 px-4 py-1.5 text-meta",
				TONE[tone],
			)}
		>
			<span className="min-w-0 truncate">{children}</span>
			{action}
		</div>
	);
}
