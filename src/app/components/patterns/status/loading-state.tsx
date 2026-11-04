import { Spinner } from "@/components/ui/spinner";

/** A spinner with its label, for a read in flight. */
export function LoadingState({ label }: { label: string }) {
	return (
		<output className="flex items-center gap-2 text-meta text-muted-foreground">
			<Spinner />
			{label}
		</output>
	);
}
