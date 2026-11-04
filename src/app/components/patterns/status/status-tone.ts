import { cn } from "@/lib/cn";

/** The tones a status view or inline line can take. */
export type StatusTone = "muted" | "destructive" | "warning";

const TEXT: Record<StatusTone, string> = {
	muted: "text-muted-foreground",
	destructive: "text-destructive",
	warning: "text-warning",
};

/** The text colour of a tone. */
export function toneText(tone: StatusTone, className?: string): string {
	return cn(TEXT[tone], className);
}
