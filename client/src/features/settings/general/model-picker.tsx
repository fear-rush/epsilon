/**
 * A searchable model picker: 600 models is a search problem, not a list problem,
 * so it is a `Command` in a `Popover` that filters by provider, name or id, and
 * the popup is as wide as its row instead of as wide as its button.
 */
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { modelKey } from "shared";
import type { SnapshotModel } from "shared";

import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const labelOf = (model: SnapshotModel) => `${model.provider}: ${model.name}`;

/** What the search matches and what the list scrolls to when it opens. */
const itemValueOf = (model: SnapshotModel) => `${labelOf(model)} ${model.id}`;

/** One group per provider, in the order the models already sorted into. */
const groupsOf = (models: readonly SnapshotModel[]): [string, SnapshotModel[]][] => {
	const groups = new Map<string, SnapshotModel[]>();
	for (const model of models) {
		const group = groups.get(model.provider);
		if (group === undefined) groups.set(model.provider, [model]);
		else group.push(model);
	}
	return [...groups];
};

export function ModelPicker({
	id,
	models,
	selected,
	disabled = false,
	label = "Default model",
	emptyText = "Choose a model…",
	onPick,
}: {
	/** The trigger's DOM id, which must not contain spaces. */
	id: string;
	models: readonly SnapshotModel[];
	/** The picked model's key, or an empty string. */
	selected: string;
	disabled?: boolean;
	/** What the button controls, for screen readers. */
	label?: string;
	emptyText?: string;
	onPick: (model: SnapshotModel) => void;
}) {
	const [open, setOpen] = useState(false);
	const current = models.find((model) => modelKey(model) === selected);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				disabled={disabled}
				render={
					<Button
						id={id}
						aria-label={label}
						variant="outline"
						className="w-full justify-between font-normal"
					/>
				}
			>
				<span className="truncate">{current === undefined ? emptyText : labelOf(current)}</span>
				<ChevronDownIcon data-icon="inline-end" className="opacity-60" />
			</PopoverTrigger>
			<PopoverContent align="start" className="w-(--anchor-width) p-0">
				<Command defaultValue={current === undefined ? undefined : itemValueOf(current)}>
					<CommandInput placeholder="Search models…" />
					<CommandList>
						<CommandEmpty>No model matches.</CommandEmpty>
						{groupsOf(models).map(([provider, entries]) => (
							<CommandGroup key={provider} heading={provider}>
								{entries.map((model) => {
									const value = modelKey(model);
									return (
										<CommandItem
											key={value}
											value={itemValueOf(model)}
											onSelect={() => {
												onPick(model);
												setOpen(false);
											}}
										>
											<span className="truncate">{model.name}</span>
											{value === selected && <CheckIcon className="ml-auto" />}
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
