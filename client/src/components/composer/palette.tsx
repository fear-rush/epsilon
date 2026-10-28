import type { RefObject } from "react";
import type { SnapshotCommand } from "shared";

import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent } from "@/components/ui/popover";

type PaletteProps = {
	open: boolean;
	/** The composer surface, so the list sits on top of it like an autocomplete. */
	anchor: RefObject<HTMLDivElement | null>;
	commands: SnapshotCommand[];
	/** The highlighted command, by name, so filtering to fewer entries keeps it. */
	selected: string | undefined;
	onSelect: (name: string) => void;
	onPick: (name: string) => void;
	/** The popover asked to close, through Escape or a click outside it. */
	onDismiss: () => void;
};

/**
 * The `/` palette: pi's own `get_commands` list, a `Command` in a `Popover`
 * anchored to the composer (docs/ui.md). The composer owns the arrow keys and
 * Enter, so the popup never takes focus and cmdk is told not to filter a second
 * time: the list is already filtered by what follows `/`.
 */
export function Palette({
	open,
	anchor,
	commands,
	selected,
	onSelect,
	onPick,
	onDismiss,
}: PaletteProps) {
	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				if (!next) onDismiss();
			}}
		>
			<PopoverContent
				side="top"
				align="start"
				sideOffset={8}
				anchor={anchor}
				initialFocus={false}
				finalFocus={false}
				className="w-(--anchor-width) max-w-[calc(100vw-2rem)] p-0"
			>
				<Command shouldFilter={false} value={selected} onValueChange={onSelect}>
					<CommandList>
						<CommandGroup heading="Commands">
							{commands.map((command) => (
								<CommandItem
									key={command.name}
									value={command.name}
									onSelect={() => onPick(command.name)}
								>
									<span className="shrink-0 font-mono whitespace-nowrap">/{command.name}</span>
									<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
										{command.description}
									</span>
									<span className="shrink-0 text-xs text-muted-foreground">{command.source}</span>
								</CommandItem>
							))}
						</CommandGroup>
						<CommandEmpty>No command here</CommandEmpty>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
