import { ChevronDownIcon } from "lucide-react";
import type { SnapshotModel } from "shared";

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
import { modelLabel } from "@/lib/model";

/** A model's identity is the pair pi switches on; the name is only a label. */
const keyOf = (model: SnapshotModel): string => `${model.provider}/${model.id}`;

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

/**
 * The AI Elements model selector: a DropdownMenu with one radio group per
 * provider. pi offers 510 models here, so the current provider comes first and
 * the rest follow alphabetically inside one scrolling menu.
 */
export function ModelMenu({ models, model, onSelect }: ModelMenuProps) {
	const current = model === undefined ? "" : keyOf(model);
	const groups = byProvider(models, model?.provider);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<InputGroupButton
						size="sm"
						className="ml-auto max-w-40 truncate rounded-full text-xs sm:max-w-64"
					/>
				}
			>
				<span className="truncate">{model === undefined ? "Model" : modelLabel(model.name)}</span>
				<ChevronDownIcon data-icon="inline-end" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="max-h-80 w-80">
				<DropdownMenuRadioGroup
					value={current}
					onValueChange={(value: string) => {
						const next = models.find((candidate) => keyOf(candidate) === value);
						if (next !== undefined) onSelect(next);
					}}
				>
					{groups.map((group) => (
						<DropdownMenuGroup key={group.provider}>
							<DropdownMenuLabel>{group.provider}</DropdownMenuLabel>
							{group.models.map((candidate) => (
								<DropdownMenuRadioItem key={keyOf(candidate)} value={keyOf(candidate)} closeOnClick>
									{candidate.name}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuGroup>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
