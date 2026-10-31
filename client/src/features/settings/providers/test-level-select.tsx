/** The level a provider test should send, plus the connection-only default. */
import { cn } from "@/lib/cn";

import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

import { THINKING_LEVELS, THINKING_LEVEL_LABELS } from "./reasoning";

const items = [
	{ value: "none", label: "No reasoning" },
	...THINKING_LEVELS.map((level) => ({ value: level, label: THINKING_LEVEL_LABELS[level] })),
];

export function TestLevelSelect({
	value,
	onChange,
	disabled = false,
	className,
}: {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<Select
			items={items}
			value={value}
			onValueChange={(next) => {
				if (next !== null) onChange(next);
			}}
		>
			<SelectTrigger
				aria-label="Reasoning level"
				disabled={disabled}
				className={cn("w-full", className)}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{items.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}
