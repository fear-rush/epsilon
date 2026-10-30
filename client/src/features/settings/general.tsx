import { useMutation } from "@tanstack/react-query";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { modelKey } from "shared";
import type { SnapshotModel } from "shared";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { setDefaultModel } from "@/api/endpoints";
import { useSettingsRefresh } from "@/features/settings/queries";
import { SettingsGroup, SettingsPage, SettingsRow } from "@/features/settings/kit/settings-section";
import type { SettingsSnapshot } from "@/api/types";

/**
 * General: whether Epsilon can run a turn, where its home is, and which
 * model a new session starts on.
 */

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

export function SettingsGeneral({ snapshot }: { snapshot: SettingsSnapshot }) {
	const refresh = useSettingsRefresh();
	const defaults = useMutation({ mutationFn: setDefaultModel, onSuccess: refresh });
	const current = snapshot.defaultModel;
	const selected =
		current === null ? "" : modelKey({ provider: current.provider, id: current.modelId });
	const models = [...snapshot.models].sort((left, right) =>
		`${left.provider}/${left.name}`.localeCompare(`${right.provider}/${right.name}`),
	);

	return (
		<SettingsPage title="General">
			<SettingsGroup title="App">
				<SettingsRow
					title="Status"
					description={
						snapshot.ready
							? `${models.length} models can run a turn.`
							: "No provider can run a turn yet. Add one under Providers."
					}
				>
					<Badge variant={snapshot.ready ? "secondary" : "warning"}>
						{snapshot.ready ? "Ready" : "Not configured"}
					</Badge>
				</SettingsRow>
				<SettingsRow
					stacked
					title="Agent home"
					description="pi reads settings, credentials, sessions and skills here."
				>
					<code className="w-full rounded-md bg-muted px-2 py-1 font-mono text-xs break-all">
						{snapshot.home}
					</code>
				</SettingsRow>
				<SettingsRow
					stacked
					title="Default model"
					description={
						current === null
							? "No default is set. pi chooses the first available model."
							: undefined
					}
				>
					<DefaultModelPicker
						models={models}
						selected={selected}
						disabled={defaults.isPending || models.length === 0}
						onPick={(model) => defaults.mutate({ provider: model.provider, modelId: model.id })}
					/>
				</SettingsRow>
			</SettingsGroup>
			{defaults.error !== null && (
				<Alert variant="destructive">
					<AlertDescription>{defaults.error.message}</AlertDescription>
				</Alert>
			)}
		</SettingsPage>
	);
}

/**
 * 600 models is a search problem, not a list problem: the dropdown is a
 * `Command` in a `Popover`, so the search field filters by provider, name or id,
 * and the popup is as wide as the row instead of as wide as the button.
 */
function DefaultModelPicker({
	models,
	selected,
	disabled,
	onPick,
}: {
	models: readonly SnapshotModel[];
	selected: string;
	disabled: boolean;
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
						id="default-model"
						aria-label="Default model"
						variant="outline"
						className="w-full justify-between font-normal"
					/>
				}
			>
				<span className="truncate">
					{current === undefined ? "Choose a model…" : labelOf(current)}
				</span>
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
