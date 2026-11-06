import { ChevronDownIcon } from "lucide-react";
import { Fragment } from "react";

import type { ModelOption } from "#protocol/conversation/session";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroupButton } from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** pi names a model by its provider and id; this is the one string both sides compare. */
const modelKey = (model: ModelOption): string => `${model.provider}/${model.id}`;

type ModelMenuProps = {
	models: ModelOption[];
	model: ModelOption | undefined;
	/** The composer opens it, because `/model` with no argument asks for this menu. */
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (model: ModelOption) => void;
};

/** Current provider first, and the model in use first in its group; the rest by name. */
const byProvider = (
	models: ModelOption[],
	current: ModelOption | undefined,
): { provider: string; models: ModelOption[] }[] => {
	const groups = new Map<string, ModelOption[]>();
	for (const candidate of models) {
		groups.set(candidate.provider, [...(groups.get(candidate.provider) ?? []), candidate]);
	}
	const providers = [...groups.keys()].toSorted((a, b) => {
		if (a === current?.provider) return -1;
		if (b === current?.provider) return 1;
		return a.localeCompare(b);
	});
	const currentKey = current === undefined ? undefined : modelKey(current);
	return providers.map((provider) => ({
		provider,
		models: (groups.get(provider) ?? []).toSorted((a, b) => {
			if (currentKey !== undefined && modelKey(a) === currentKey) return -1;
			if (currentKey !== undefined && modelKey(b) === currentKey) return 1;
			return a.name.localeCompare(b.name);
		}),
	}));
};

/**
 * The model picker: the AI Elements Model Selector's first menu, a radio group per
 * provider. pi offers hundreds of models, so the list scrolls inside the menu; the
 * current provider leads and the model in use is the checked row.
 */
export function ModelMenu({ models, model, open, onOpenChange, onSelect }: ModelMenuProps) {
	const current = model === undefined ? "" : modelKey(model);
	const groups = byProvider(models, model);

	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<Tooltip>
				<TooltipTrigger
					render={
						<DropdownMenuTrigger
							render={
								<InputGroupButton
									size="sm"
									className="w-auto max-w-40 cursor-pointer gap-1 truncate rounded-md text-meta sm:max-w-64"
								/>
							}
						/>
					}
				>
					<span className="truncate">{model?.name ?? "Model"}</span>
					<ChevronDownIcon data-icon="inline-end" />
				</TooltipTrigger>
				<TooltipContent side="top">Model</TooltipContent>
			</Tooltip>
			<DropdownMenuContent side="top" align="start" className="w-64">
				<DropdownMenuRadioGroup
					value={current}
					onValueChange={(value: string) => {
						const picked = models.find((candidate) => modelKey(candidate) === value);
						if (picked === undefined) return;
						onSelect(picked);
						onOpenChange(false);
					}}
				>
					{groups.map((group, index) => (
						<Fragment key={group.provider}>
							{index > 0 && <DropdownMenuSeparator />}
							<DropdownMenuGroup>
								<DropdownMenuLabel>{group.provider}</DropdownMenuLabel>
								{group.models.map((candidate) => (
									<DropdownMenuRadioItem
										key={modelKey(candidate)}
										value={modelKey(candidate)}
										closeOnClick
									>
										<span className="truncate">{candidate.name}</span>
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuGroup>
						</Fragment>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
