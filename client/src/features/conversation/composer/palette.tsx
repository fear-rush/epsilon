import type { RefObject } from "react";
import type { AutocompleteItem, SnapshotCommand } from "shared";

import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent } from "@/components/ui/popover";

/**
 * One row of the palette. A command comes from `/`, and a suggestion from an
 * extension's autocomplete provider; both share one list, so the arrow keys and
 * Enter move through what the operator sees.
 */
export type PaletteEntry =
	| { kind: "command"; key: string; command: SnapshotCommand }
	| { kind: "suggestion"; key: string; item: AutocompleteItem; prefix: string };

type PaletteProps = {
	open: boolean;
	/** The composer surface, so the list sits on top of it like an autocomplete. */
	anchor: RefObject<HTMLDivElement | null>;
	entries: PaletteEntry[];
	/** The highlighted entry's key, so filtering to fewer entries keeps it. */
	selected: string | undefined;
	onSelect: (key: string) => void;
	onPick: (entry: PaletteEntry) => void;
	/** The popover asked to close, through Escape or a click outside it. */
	onDismiss: () => void;
};

const isCommand = (entry: PaletteEntry): entry is Extract<PaletteEntry, { kind: "command" }> =>
	entry.kind === "command";

/**
 * The `/` palette: Epsilon's own commands and pi's `get_commands` list, plus what an
 * extension's autocomplete provider suggests, a `Command` in a `Popover` anchored to
 * the composer. The composer owns the arrow keys and Enter, so the popup never takes
 * focus and cmdk is told not to filter a second time: the list is already filtered.
 */
export function Palette({
	open,
	anchor,
	entries,
	selected,
	onSelect,
	onPick,
	onDismiss,
}: PaletteProps) {
	const commands = entries.filter(isCommand);
	const suggestions = entries.filter((entry) => entry.kind === "suggestion");
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
				className="w-(--anchor-width) p-0"
			>
				<Command shouldFilter={false} value={selected} onValueChange={onSelect}>
					<CommandList>
						{commands.length > 0 && (
							<CommandGroup heading="Commands">
								{commands.map((entry) => (
									<CommandItem key={entry.key} value={entry.key} onSelect={() => onPick(entry)}>
										<span className="shrink-0 font-mono whitespace-nowrap">
											/{entry.command.name}
										</span>
										{entry.command.argumentHint !== undefined && (
											<span className="shrink-0 font-mono whitespace-nowrap text-meta text-muted-foreground">
												{entry.command.argumentHint}
											</span>
										)}
										<span className="min-w-0 flex-1 truncate text-meta text-muted-foreground">
											{entry.command.description}
										</span>
										<span className="shrink-0 text-meta text-muted-foreground">
											{entry.command.source}
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}
						{suggestions.length > 0 && (
							<CommandGroup heading="Suggestions">
								{suggestions.map((entry) => (
									<CommandItem key={entry.key} value={entry.key} onSelect={() => onPick(entry)}>
										<span className="min-w-0 flex-1 truncate">{entry.item.label}</span>
										{entry.item.description !== undefined && (
											<span className="min-w-0 flex-1 truncate text-meta text-muted-foreground">
												{entry.item.description}
											</span>
										)}
									</CommandItem>
								))}
							</CommandGroup>
						)}
						<CommandEmpty>Nothing to suggest here</CommandEmpty>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
