import { ChevronDownIcon, ShieldIcon } from "lucide-react";
import type { UiStatus } from "shared";

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
import { PERMISSION_MODES } from "@/lib/permission";
import type { PermissionMode } from "@/lib/permission";

/**
 * The extension reports the mode through a keyed status, with its own glyph and
 * `perm:` prefix. The browser shows its own three labels instead, and switches
 * with the extension's `/permission <mode>` command.
 */
const currentMode = (statuses: UiStatus[]): PermissionMode | undefined => {
	const text = statuses.find((status) => status.key === "permission")?.text ?? "";
	const match = text.match(/perm:(strict|ask|yolo)/)?.[1];
	return PERMISSION_MODES.find((mode) => mode.value === match)?.value;
};

export function PermissionMenu({
	statuses,
	onSelect,
}: {
	statuses: UiStatus[];
	onSelect: (mode: PermissionMode) => void;
}) {
	const mode = currentMode(statuses);
	if (mode === undefined) return null;
	const active = PERMISSION_MODES.find((candidate) => candidate.value === mode);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<InputGroupButton size="sm" className="rounded-full text-muted-foreground" />}
			>
				<ShieldIcon data-icon="inline-start" />
				{active?.label ?? "Permission"}
				<ChevronDownIcon data-icon="inline-end" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-64">
				<DropdownMenuLabel>Permission</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={mode}
					onValueChange={(value: PermissionMode) => onSelect(value)}
				>
					<DropdownMenuGroup>
						{PERMISSION_MODES.map((candidate) => (
							<DropdownMenuRadioItem
								key={candidate.value}
								value={candidate.value}
								closeOnClick
								className="items-start"
							>
								<span className="flex flex-col gap-0.5">
									<span>{candidate.label}</span>
									<span className="text-xs text-muted-foreground">{candidate.description}</span>
								</span>
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuGroup>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
