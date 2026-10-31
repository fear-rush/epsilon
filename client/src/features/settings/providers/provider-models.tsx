import { InfoIcon, PlusIcon, PencilIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { useState } from "react";
import { PROVIDER_APIS, parseProviderApi } from "shared";
import type { ThinkingLevel } from "shared";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tip } from "@/components/patterns/tip";
import { testProvider } from "@/api/endpoints";
import { AnimatedRow } from "@/components/patterns/section/animated-row";
import { DeleteDialog } from "@/components/patterns/dialog/confirm-dialogs";
import { InlineStatus } from "@/components/patterns/status/inline-status";
import { Notice } from "@/components/patterns/status/notice";
import { Section } from "@/components/patterns/section/section";
import { useAnimatedRows } from "@/components/patterns/section/use-animated-rows";
import { testInputOf } from "./provider-draft";
import type { ProviderDraft } from "./provider-draft";
import { ProviderImportDialog } from "./provider-import-dialog";
import { ProviderModelDialog } from "./provider-model-dialog";
import type { ModelOverride, ProviderDetail, ProviderModelInput } from "@/api/types";
import { Badge } from "@/components/ui/badge";

/**
 * The model catalog. A provider pi ships keeps its catalog read-only and edits
 * fields through `modelOverrides`; a custom provider, or a built-in the operator
 * deliberately replaced, edits its `models` list. Adding a model to a built-in is
 * the one action that replaces pi's catalog, so it asks first (docs/DECISIONS.md, Configure in the dashboard).
 *
 * `catalogEditable` is off where the page is about an account rather than a catalog:
 * pi ships the list and keeps it current, so replacing it belongs with the endpoint
 * override, not next to a sign-in. Overriding one model stays available, because that
 * is what `modelOverrides` is for.
 */

type EditTarget = { model: ProviderModelInput | undefined; index: number | undefined };

const overrideOf = (model: ProviderModelInput): ModelOverride => ({
	name: model.name,
	api: model.api,
	baseUrl: model.baseUrl,
	reasoning: model.reasoning,
	thinkingLevelMap: model.thinkingLevelMap,
	compat: model.compat,
	input: model.input,
	contextWindow: model.contextWindow,
	maxTokens: model.maxTokens,
	cost: model.cost,
});

export function ProviderModels({
	draft,
	detail,
	builtin,
	catalogEditable = true,
	update,
}: {
	draft: ProviderDraft;
	detail: ProviderDetail | undefined;
	builtin: boolean;
	/** Whether the catalog itself may be replaced. Off for an account provider. */
	catalogEditable?: boolean;
	update: (patch: Partial<ProviderDraft>) => void;
}) {
	const [editing, setEditing] = useState<EditTarget | undefined>(undefined);
	const [overriding, setOverriding] = useState<ProviderModelInput | undefined>(undefined);
	const [importOpen, setImportOpen] = useState(false);
	const [replacing, setReplacing] = useState<"add" | "import" | undefined>(undefined);
	const api = parseProviderApi(draft.api);
	const importable =
		api !== undefined && PROVIDER_APIS.some((entry) => entry.id === api && entry.modelsPath);
	const custom = !builtin || draft.customCatalog;
	const catalog = detail?.catalog ?? [];
	const count = custom ? draft.models.length : catalog.length;
	const testDraftModel = (model: ProviderModelInput, level?: ThinkingLevel): Promise<string> =>
		testProvider(testInputOf(draft, model, level));

	const startAdd = () => {
		if (!custom) setReplacing("add");
		else setEditing({ model: undefined, index: undefined });
	};
	const startImport = () => {
		if (!custom) setReplacing("import");
		else setImportOpen(true);
	};
	// The catalog is replaced when the action actually adds something, not when
	// the warning is confirmed: canceling the dialog must leave pi's catalog alone.
	const confirmReplace = () => {
		const next = replacing;
		setReplacing(undefined);
		if (next === "add") setEditing({ model: undefined, index: undefined });
		else if (next === "import") setImportOpen(true);
	};

	return (
		<Section title={`Models (${count})`}>
			<div className="pad-row">
				<div className="grid gap-field">
					{catalogEditable && (
						<div className="flex flex-wrap items-center gap-2">
							<Button type="button" variant="outline" size="sm" onClick={startAdd}>
								<PlusIcon />
								Add model
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={startImport}
								disabled={!importable}
							>
								Fetch models from provider
							</Button>
							{!importable && (
								<InlineStatus icon={InfoIcon}>No shared model list for this API.</InlineStatus>
							)}
						</div>
					)}

					{builtin && custom && (
						<Notice
							tone="warning"
							action={
								<Button
									type="button"
									variant="outline"
									size="xs"
									onClick={() => update({ customCatalog: false, models: [] })}
								>
									Use pi's catalog
								</Button>
							}
						>
							Saving replaces the {detail?.catalog.length ?? 0} models pi ships.
						</Notice>
					)}

					<div className="max-h-80 divide-y overflow-y-auto rounded-xl border">
						{custom ? (
							draft.models.length === 0 ? (
								<p className="pad-row text-body text-muted-foreground">No models yet.</p>
							) : (
								<CustomModelRows
									models={draft.models}
									onEdit={(index, model) => setEditing({ model, index })}
									onChange={(models) => update({ models })}
								/>
							)
						) : catalog.length === 0 ? (
							<p className="pad-row text-body text-muted-foreground">No models.</p>
						) : (
							<CatalogModelRows
								catalog={catalog}
								overrides={draft.modelOverrides}
								onEdit={(model, override) =>
									setOverriding({ id: model.id, name: model.name, ...override })
								}
								onClear={(model) => {
									const next = { ...draft.modelOverrides };
									delete next[model.id];
									update({ modelOverrides: next });
								}}
							/>
						)}
					</div>
				</div>
			</div>

			{editing !== undefined && (
				<ProviderModelDialog
					key={`${editing.index ?? "new"}-${editing.model?.id ?? ""}`}
					onClose={() => setEditing(undefined)}
					title={editing.index === undefined ? "Add a model" : "Edit model"}
					model={editing.model}
					providerApi={api}
					lockId={editing.index !== undefined}
					onTest={testDraftModel}
					onSave={(model) => {
						if (editing.index !== undefined) {
							const next = [...draft.models];
							next[editing.index] = model;
							update({ models: next });
							return;
						}
						if (!custom) {
							update({ customCatalog: true, models: [model], modelOverrides: {} });
							return;
						}
						update({ models: [...draft.models, model] });
					}}
				/>
			)}

			{overriding !== undefined && (
				<ProviderModelDialog
					key={`override-${overriding.id}`}
					onClose={() => setOverriding(undefined)}
					title={`Override ${overriding.name ?? overriding.id}`}
					model={overriding}
					providerApi={api}
					lockId
					onTest={testDraftModel}
					onSave={(model) =>
						update({
							modelOverrides: { ...draft.modelOverrides, [model.id]: overrideOf(model) },
						})
					}
				/>
			)}

			{importOpen && api !== undefined && (
				<ProviderImportDialog
					onClose={() => setImportOpen(false)}
					providerId={detail?.id}
					baseUrl={draft.baseUrl}
					api={api}
					apiKey={draft.apiKey}
					onAdd={(models) => {
						const existing = new Set(draft.models.map((model) => model.id));
						update({
							models: [...draft.models, ...models.filter((model) => !existing.has(model.id))],
						});
					}}
				/>
			)}

			<DeleteDialog
				open={replacing !== undefined}
				title="Replace pi's catalog?"
				description={`${replacing === "import" ? "Fetching models" : "Adding a model"} replaces the ${detail?.catalog.length ?? 0} models pi ships. Overrides are cleared.`}
				error={null}
				confirmLabel="Replace catalog"
				onOpenChange={(open) => {
					if (!open) setReplacing(undefined);
				}}
				onConfirm={confirmReplace}
			/>
		</Section>
	);
}

/**
 * The two model lists. A custom catalog edits its entries directly; pi's catalog
 * edits one override per model. Both rows expose the same actions: pencil to edit,
 * trash to remove, undo to clear an override (docs/DECISIONS.md, Configure in the dashboard).
 */

function ModelRow({ name, id, children }: { name: string; id: string; children: ReactNode }) {
	return (
		<div className="flex items-center gap-2 pad-item">
			<span className="min-w-0 flex-1">
				<span className="block truncate text-body font-medium">{name}</span>
				<span className="block truncate text-meta text-muted-foreground">{id}</span>
			</span>
			{children}
		</div>
	);
}

function CustomModelRows({
	models,
	onEdit,
	onChange,
}: {
	models: ProviderModelInput[];
	onEdit: (index: number, model: ProviderModelInput) => void;
	/** The list after a removal, applied once the row has collapsed. */
	onChange: (models: ProviderModelInput[]) => void;
}) {
	const { closing, remove } = useAnimatedRows(models, onChange);
	return models.map((model, index) => (
		<AnimatedRow key={`${model.id}-${index}`} closing={closing === index}>
			<ModelRow name={model.name ?? model.id} id={model.id}>
				<Tip label={`Edit ${model.name ?? model.id}`}>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={`Edit ${model.name ?? model.id}`}
						onClick={() => onEdit(index, model)}
					>
						<PencilIcon />
					</Button>
				</Tip>
				<Tip label={`Remove ${model.name ?? model.id}`}>
					<Button
						type="button"
						variant="destructive"
						size="icon-sm"
						aria-label={`Remove ${model.name ?? model.id}`}
						onClick={() => remove(index)}
					>
						<Trash2Icon />
					</Button>
				</Tip>
			</ModelRow>
		</AnimatedRow>
	));
}

function CatalogModelRows({
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
				<Tip label={override === undefined ? `Override ${name}` : `Edit override for ${name}`}>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={override === undefined ? `Override ${name}` : `Edit override for ${name}`}
						onClick={() => onEdit(model, override)}
					>
						<PencilIcon />
					</Button>
				</Tip>
				{override !== undefined && (
					<Tip label={`Clear override for ${name}`}>
						<Button
							type="button"
							variant="destructive"
							size="icon-sm"
							aria-label={`Clear override for ${name}`}
							onClick={() => onClear(model)}
						>
							<Undo2Icon />
						</Button>
					</Tip>
				)}
			</ModelRow>
		);
	});
}
