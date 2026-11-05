/** The level a provider test should send, plus the connection-only default. */
import type { ThinkingLevel } from "#protocol/conversation/session";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";

import { THINKING_LEVELS, THINKING_LEVEL_LABELS } from "./reasoning";

/** The test's own value for "send no reasoning field at all". */
const NO_REASONING = "none";

const items = [
	{ label: "No reasoning", value: NO_REASONING },
	...THINKING_LEVELS.map((level: ThinkingLevel) => ({
		label: THINKING_LEVEL_LABELS[level],
		value: level,
	})),
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
