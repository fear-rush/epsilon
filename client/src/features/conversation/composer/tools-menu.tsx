import { ChevronDownIcon, WrenchIcon } from "lucide-react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroupButton } from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Whether the session may run commands and change files. Reading stays on either
 * way, because a skill is loaded by reading its file. A chat starts without the
 * coding tools and a project with them; pi keeps the choice in the transcript.
 */
const MODES = [
	{
		value: "read",
		label: "Read only",
		description: "Reads files, skills and MCP tools. No commands, no edits",
	},
	{
		value: "code",
		label: "Commands & edits",
		description: "Also runs shell commands and writes files",
	},
] as const;

type ToolsMode = (typeof MODES)[number]["value"];

export function ToolsMenu({
	codingTools,
	onSelect,
}: {
	codingTools: boolean;
	onSelect: (enabled: boolean) => void;
}) {
	const mode: ToolsMode = codingTools ? "code" : "read";
	const active = MODES.find((candidate) => candidate.value === mode);

	return (
		<DropdownMenu>
			<Tooltip>
				<TooltipTrigger
					render={
						<DropdownMenuTrigger
							render={<InputGroupButton size="sm" className="rounded-md text-meta" />}
						/>
					}
				>
					<WrenchIcon data-icon="inline-start" />
					{active?.label}
					<ChevronDownIcon data-icon="inline-end" />
				</TooltipTrigger>
				<TooltipContent side="top">
					Choose whether this chat can run commands and edit files.
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="start" className="w-64">
				<DropdownMenuRadioGroup
					value={mode}
					onValueChange={(value: ToolsMode) => onSelect(value === "code")}
				>
					<DropdownMenuGroup>
						<DropdownMenuLabel>Tools</DropdownMenuLabel>
						{MODES.map((candidate) => (
							<DropdownMenuRadioItem
								key={candidate.value}
								value={candidate.value}
								closeOnClick
								className="items-start"
							>
								<span className="flex flex-col gap-0.5">
									<span>{candidate.label}</span>
									<span className="text-meta text-muted-foreground">{candidate.description}</span>
								</span>
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuGroup>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
