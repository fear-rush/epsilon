import { ChevronDownIcon } from "lucide-react";
import { thinkingLevelSchema } from "shared";
import type { ThinkingLevel } from "shared";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroupButton } from "@/components/ui/input-group";

/**
 * The thinking-level picker. pi decides which levels a model supports, so the
 * menu renders only what the session reports and stays hidden for a model that
 * offers nothing above "off".
 */

const labels: Record<ThinkingLevel, string> = {
	off: "Off",
	minimal: "Minimal",
	low: "Low",
	medium: "Medium",
	high: "High",
	xhigh: "Extra high",
	max: "Max",
};

export function ThinkingMenu({
	level,
	levels,
	onSelect,
}: {
	level: ThinkingLevel;
	levels: ThinkingLevel[];
	onSelect: (level: ThinkingLevel) => void;
}) {
	if (levels.length <= 1) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<InputGroupButton
						size="sm"
						className="w-auto cursor-pointer gap-1 rounded-md text-xs"
						aria-label={`Thinking level: ${labels[level]}`}
					/>
				}
			>
				<span>{labels[level]}</span>
				<ChevronDownIcon data-icon="inline-end" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-40">
				<DropdownMenuRadioGroup
					value={level}
					onValueChange={(value: string) => {
						const parsed = thinkingLevelSchema.safeParse(value);
						if (parsed.success) onSelect(parsed.data);
					}}
				>
					<DropdownMenuLabel>Thinking level</DropdownMenuLabel>
					{levels.map((candidate) => (
						<DropdownMenuRadioItem key={candidate} value={candidate} closeOnClick>
							{labels[candidate]}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
