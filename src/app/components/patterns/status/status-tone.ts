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

const SURFACE: Record<Tone, string> = {
	neutral: "border-border bg-muted/40",
	info: "border-info/30 bg-info/5",
	success: "border-success/30 bg-success/5",
	warning: "border-warning/30 bg-warning/5",
	danger: "border-destructive/30 bg-destructive/5",
};

/**
 * The border and fill of a tone, one look for the notice, the status strip and the status
 * row. The words stay in `foreground`; only the icon takes the tone's colour.
 */
export function toneSurface(tone: Tone, className?: string): string {
	return cn(SURFACE[tone], className);
}
