/**
 * The two model lists. A custom catalog edits its entries directly; pi's catalog
 * edits one override per model. Both rows expose the same actions: pencil to edit,
 * trash to remove, undo to clear an override (ADR-0012).
 */
import { PencilIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ModelOverride, ProviderModelInput } from "@/api/types";

function ModelRow({ name, id, children }: { name: string; id: string; children: ReactNode }) {
	return (
		<div className="flex items-center gap-2 px-3 py-2">
			<span className="min-w-0 flex-1">
				<span className="block truncate text-sm font-medium">{name}</span>
				<span className="block truncate text-xs text-muted-foreground">{id}</span>
			</span>
			{children}
		</div>
	);
}

export function CustomModelRows({
	models,
	onEdit,
	onRemove,
}: {
	models: ProviderModelInput[];
	onEdit: (index: number, model: ProviderModelInput) => void;
	onRemove: (index: number) => void;
}) {
	return models.map((model, index) => (
		<ModelRow key={`${model.id}-${index}`} name={model.name ?? model.id} id={model.id}>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label={`Edit ${model.name ?? model.id}`}
				onClick={() => onEdit(index, model)}
			>
				<PencilIcon />
			</Button>
			<Button
				type="button"
				variant="destructive"
				size="icon-sm"
				aria-label={`Remove ${model.name ?? model.id}`}
				onClick={() => onRemove(index)}
			>
				<Trash2Icon />
			</Button>
		</ModelRow>
	));
}

export function CatalogModelRows({
	catalog,
	overrides,
	onEdit,
	onClear,
}: {
	catalog: ProviderModelInput[];
	overrides: Record<string, ModelOverride>;
	onEdit: (model: ProviderModelInput, override: ModelOverride | undefined) => void;
	onClear: (model: ProviderModelInput) => void;
}) {
	return catalog.map((model) => {
		const override = overrides[model.id];
		const name = model.name ?? model.id;
		return (
			<ModelRow key={model.id} name={name} id={model.id}>
				{override !== undefined && <Badge variant="secondary">Override</Badge>}
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={override === undefined ? `Override ${name}` : `Edit override for ${name}`}
					onClick={() => onEdit(model, override)}
				>
					<PencilIcon />
				</Button>
				{override !== undefined && (
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={`Clear override for ${name}`}
						onClick={() => onClear(model)}
					>
						<Undo2Icon />
					</Button>
				)}
			</ModelRow>
		);
	});
}
