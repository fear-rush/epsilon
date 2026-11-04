import { cn } from "@/lib/cn";

/**
 * The one tone vocabulary. Every surface that carries a message takes it: a status view, a
 * notice, an inline line, the status line and the transcript's own entries.
 */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const TEXT: Record<Tone, string> = {
	neutral: "text-muted-foreground",
	info: "text-info",
	success: "text-success",
	warning: "text-warning",
	danger: "text-destructive",
};

/** The text colour of a tone. */
export function toneText(tone: Tone, className?: string): string {
	return cn(TEXT[tone], className);
}
