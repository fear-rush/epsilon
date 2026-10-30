import { ChevronDownIcon, ShieldIcon } from "lucide-react";
import { PERMISSION_STATUS_KEY, parsePermissionStatus, PERMISSION_MODE_VALUES } from "shared";
import type { UiStatus, PermissionMode } from "shared";

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

/**
 * The extension reports the mode through a keyed status, with its own glyph and
 * `perm:` prefix. The browser shows its own three labels instead, and switches
 * with the extension's `/permission <mode>` command.
 */
const currentMode = (statuses: UiStatus[]): PermissionMode | undefined => {
	const text = statuses.find((status) => status.key === PERMISSION_STATUS_KEY)?.text ?? "";
	return parsePermissionStatus(text);
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
			<DropdownMenuTrigger render={<InputGroupButton size="sm" className="rounded-md text-xs" />}>
				<ShieldIcon data-icon="inline-start" />
				{active?.label ?? "Permission"}
				<ChevronDownIcon data-icon="inline-end" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-64">
				<DropdownMenuRadioGroup
					value={mode}
					onValueChange={(value: PermissionMode) => onSelect(value)}
				>
					<DropdownMenuGroup>
						<DropdownMenuLabel>Permission</DropdownMenuLabel>
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

export type { PermissionMode };

/**
 * The words the browser shows for each mode. The values come from `shared`, so a
 * mode cannot exist on one side only. Yolo asks for nothing, and its description
 * says so.
 */
const WORDS: Record<PermissionMode, { label: string; description: string }> = {
	strict: { label: "Strict", description: "Ask before every command and edit" },
	ask: { label: "Ask", description: "Ask before commands, writes allowed" },
	yolo: { label: "Yolo", description: "Run everything without asking" },
};

const PERMISSION_MODES = PERMISSION_MODE_VALUES.map((value) => ({ value, ...WORDS[value] }));
