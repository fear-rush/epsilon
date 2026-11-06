import { Button } from "@/components/ui/button";

/**
 * A short prompt a reader can send in one click. The row scrolls sideways when the
 * prompts do not fit, and the edge that has more to show fades.
 */
export function Suggestion({
	suggestions,
	onSelect,
	disabled = false,
}: {
	suggestions: ReadonlyArray<string>;
	onSelect: (suggestion: string) => void;
	disabled?: boolean;
}) {
	if (suggestions.length === 0) return null;
	return (
		<div className="scrollbar-none flex scroll-fade-x gap-2 overflow-x-auto overscroll-x-contain">
			{suggestions.map((suggestion) => (
				<Button
					key={suggestion}
					variant="outline"
					size="sm"
					className="shrink-0 animate-enter-fade"
					disabled={disabled}
					onClick={() => onSelect(suggestion)}
				>
					{suggestion}
				</Button>
			))}
		</div>
	);
}
