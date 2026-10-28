import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";
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

/** A model's identity is the pair pi switches on; the name is only a label. */
const keyOf = (model: SnapshotModel): string => `${model.provider}/${model.id}`;

/** pi offers every configured provider at once; keep the open list short. */
const MAX_RESULTS = 60;

type ModelPickerProps = {
	models: SnapshotModel[];
	model: SnapshotModel | undefined;
	onSelect: (model: SnapshotModel) => void;
};

const groupByProvider = (
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

/**
 * A searchable picker rather than a dropdown: pi lists 510 models here, so the
 * closed list starts with the current provider and the search covers the rest.
 */
export function ModelPicker({ models, model, onSelect }: ModelPickerProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const current = model === undefined ? undefined : keyOf(model);

	const search = query.trim().toLowerCase();
	const pool =
		search === "" ? models.filter((candidate) => candidate.provider === model?.provider) : models;
	const matches =
		search === ""
			? pool
			: pool.filter((candidate) =>
					`${candidate.name} ${candidate.id} ${candidate.provider}`.toLowerCase().includes(search),
				);
	const visible = matches.slice(0, MAX_RESULTS);
	const groups = groupByProvider(visible, model?.provider);

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setQuery("");
			}}
		>
			<PopoverTrigger
				render={
					<Button
						variant="outline"
						size="sm"
						className="max-w-[45vw] justify-between gap-2 text-xs font-normal"
					/>
				}
			>
				<span className="truncate">{model?.name ?? "Select model"}</span>
				<ChevronsUpDownIcon className="size-3 shrink-0 opacity-50" />
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 gap-0 p-0">
				<Command shouldFilter={false}>
					<CommandInput
						autoFocus
						value={query}
						onValueChange={setQuery}
						placeholder="Search models"
					/>
					<CommandList className="max-h-72">
						<CommandEmpty>No model found.</CommandEmpty>
						{groups.map((group) => (
							<CommandGroup key={group.provider} heading={group.provider}>
								{group.models.map((candidate) => (
									<CommandItem
										key={keyOf(candidate)}
										value={keyOf(candidate)}
										onSelect={() => {
											onSelect(candidate);
											setOpen(false);
										}}
									>
										<span className="truncate">{candidate.name}</span>
										{keyOf(candidate) === current && (
											<CheckIcon className="ml-auto size-4 shrink-0" />
										)}
									</CommandItem>
								))}
							</CommandGroup>
						))}
					</CommandList>
					<div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
						{matches.length > MAX_RESULTS
							? `${MAX_RESULTS} of ${matches.length} matches, keep typing`
							: `${matches.length} model${matches.length === 1 ? "" : "s"}`}
					</div>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
