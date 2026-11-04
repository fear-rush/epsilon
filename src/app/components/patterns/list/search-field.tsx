import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";

/**
 * The one search control of a list: a full-width input with a leading icon, and
 * the same sentence as its placeholder and its accessible name.
 */
export function SearchField({
	value,
	onChange,
	label,
}: {
	value: string;
	onChange: (value: string) => void;
	label: string;
}) {
	return (
		<div className="relative w-full">
			<SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				value={value}
				placeholder={label}
				aria-label={label}
				className="pl-8"
				onChange={(event) => onChange(event.target.value)}
			/>
		</div>
	);
}
