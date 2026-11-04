import { Schema } from "effect";
import { ChevronDownIcon } from "lucide-react";

import { ThinkingLevel } from "#protocol/conversation/session";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroupButton } from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
	open,
	onOpenChange,
	onSelect,
}: {
	level: ThinkingLevel;
	levels: ThinkingLevel[];
	/** The composer opens it, because `/thinking` with no argument asks for this menu. */
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (level: ThinkingLevel) => void;
}) {
	if (levels.length <= 1) return null;

	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<Tooltip>
				<TooltipTrigger
					render={
						<DropdownMenuTrigger
							render={
								<InputGroupButton
									size="sm"
									className="w-auto cursor-pointer gap-1 rounded-md text-meta"
									aria-label={`Thinking level: ${labels[level]}`}
								/>
							}
						/>
					}
				>
					<span>{labels[level]}</span>
					<ChevronDownIcon data-icon="inline-end" />
				</TooltipTrigger>
				<TooltipContent side="top">Thinking</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="start" className="w-40">
				<DropdownMenuRadioGroup
					value={level}
					onValueChange={(value: string) => {
						if (Schema.is(ThinkingLevel)(value)) onSelect(value);
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
