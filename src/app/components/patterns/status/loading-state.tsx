import { Loader2Icon } from "lucide-react";

/**
 * A spinner with its label, for a read in flight.
 *
 * The spinner is decorative here: the page's one live region is the app's status line, and
 * a second `role="status"` would talk over it.
 */
export function LoadingState({ label }: { label: string }) {
	return (
		<p className="flex items-center gap-2 text-meta text-muted-foreground">
			<Loader2Icon className="size-icon animate-spin" aria-hidden />
			{label}
		</p>
	);
}
