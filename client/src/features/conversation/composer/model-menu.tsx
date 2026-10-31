import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { modelKey } from "shared";
import type { SnapshotModel } from "shared";

import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { InputGroupButton } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type ModelMenuProps = {
	models: SnapshotModel[];
	model: SnapshotModel | undefined;
	onSelect: (model: SnapshotModel) => void;
};

/** Current provider first, the rest alphabetically; names sorted inside each. */
const byProvider = (
	models: SnapshotModel[],
	current: string | undefined,
): { provider: string; models: SnapshotModel[] }[] => {
	const groups = new Map<string, SnapshotModel[]>();
	for (const candidate of models) {
		groups.set(candidate.provider, [...(groups.get(candidate.provider) ?? []), candidate]);
	}
	const providers = [...groups.keys()].sort((a, b) => {
		if (a === current) return -1;
		if (b === current) return 1;
		return a.localeCompare(b);
	});
	return providers.map((provider) => ({
		provider,
		models: (groups.get(provider) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
	}));
};

/** What the search reads: every field a model can be remembered by. */
const searchText = (model: SnapshotModel): string =>
	`${model.name} ${model.id} ${model.provider}`.toLowerCase();

/**
 * The model picker: a `Command` in a `Popover`, because pi offers 510 models and
 * scrolling a radio group is not a way to find one. The search matches the name,
 * the id and the provider case-insensitively, the current provider's group leads,
 * and the box opens scrolled to the model in use.
 */
export function ModelMenu({ models, model, onSelect }: ModelMenuProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const current = model === undefined ? "" : modelKey(model);
	const needle = query.trim().toLowerCase();
	const matches =
		needle === "" ? models : models.filter((candidate) => searchText(candidate).includes(needle));
	const groups = byProvider(matches, model?.provider);

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setQuery("");
			}}
		>
			<Tooltip>
				<TooltipTrigger
					render={
						<PopoverTrigger
							render={
								<InputGroupButton
									size="sm"
									className="ml-auto w-auto max-w-40 cursor-pointer gap-1 truncate rounded-md text-meta sm:max-w-64"
								/>
							}
						/>
					}
				>
					<span className="truncate">{model?.name ?? "Model"}</span>
					<ChevronDownIcon data-icon="inline-end" />
				</TooltipTrigger>
				<TooltipContent side="top">Choose the model this chat uses.</TooltipContent>
			</Tooltip>
			<PopoverContent side="top" align="start" className="w-80 p-0">
				<Command
					// The list is already filtered above, so cmdk neither filters again nor
					// hides a row; `defaultValue` marks the model in use and scrolls to it.
					shouldFilter={false}
					defaultValue={current}
				>
					<CommandInput placeholder="Search models…" value={query} onValueChange={setQuery} />
					<CommandList>
						<CommandEmpty>No model matches.</CommandEmpty>
						{groups.map((group) => (
							<CommandGroup key={group.provider} heading={group.provider}>
								{group.models.map((candidate) => {
									const value = modelKey(candidate);
									return (
										<CommandItem
											key={value}
											value={value}
											data-checked={value === current}
											onSelect={() => {
												onSelect(candidate);
												setOpen(false);
											}}
										>
											<span className="truncate">{candidate.name}</span>
										</CommandItem>
									);
								})}
							</CommandGroup>
						))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
