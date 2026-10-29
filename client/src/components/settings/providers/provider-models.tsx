/**
 * The model catalog. A provider pi ships keeps its catalog read-only and edits
 * fields through `modelOverrides`; a custom provider, or a built-in the operator
 * deliberately replaced, edits its `models` list. Adding a model to a built-in is
 * the one action that replaces pi's catalog, so it asks first (ADR-0012).
 */
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { PROVIDER_APIS, parseProviderApi } from "shared";
import type { ModelOverride, ProviderDetail, ProviderModelInput } from "shared";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsBlock, SettingsGroup } from "@/components/settings/settings-section";

import type { ProviderDraft } from "./provider-draft";
import { ProviderImportDialog } from "./provider-import-dialog";
import { ProviderModelDialog } from "./provider-model-dialog";

type EditTarget = { model: ProviderModelInput | undefined; index: number | undefined };

const overrideOf = (model: ProviderModelInput): ModelOverride => ({
	name: model.name,
	api: model.api,
	baseUrl: model.baseUrl,
	reasoning: model.reasoning,
	input: model.input,
	contextWindow: model.contextWindow,
	maxTokens: model.maxTokens,
	cost: model.cost,
});

export function ProviderModels({
	draft,
	detail,
	builtin,
	update,
}: {
	draft: ProviderDraft;
	detail: ProviderDetail | undefined;
	builtin: boolean;
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
		<SettingsGroup title={custom ? `Models (${count})` : `Models pi ships (${count})`}>
			<SettingsBlock>
				<div className="grid gap-3">
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
							<span className="text-xs text-muted-foreground">
								This API family has no shared model list; add models by hand.
							</span>
						)}
					</div>

					{builtin && custom && (
						<Alert>
							<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
								<span>
									Saving replaces the {detail?.catalog.length ?? 0}-model catalog pi ships for this
									provider with this list.
								</span>
								<Button
									type="button"
									variant="outline"
									size="xs"
									onClick={() => update({ customCatalog: false, models: [] })}
								>
									Use pi's catalog
								</Button>
							</AlertDescription>
						</Alert>
					)}

					<div className="max-h-80 divide-y overflow-y-auto rounded-xl border">
						{custom ? (
							draft.models.length === 0 ? (
								<p className="p-3 text-sm text-muted-foreground">No models yet.</p>
							) : (
								draft.models.map((model, index) => (
									<div key={`${model.id}-${index}`} className="flex items-center gap-2 px-3 py-2">
										<span className="min-w-0 flex-1">
											<span className="block truncate text-sm font-medium">
												{model.name ?? model.id}
											</span>
											<span className="block truncate text-xs text-muted-foreground">
												{model.id}
											</span>
										</span>
										<Button
											type="button"
											variant="ghost"
											size="xs"
											onClick={() => setEditing({ model, index })}
										>
											Edit
										</Button>
										<Button
											type="button"
											variant="destructive"
											size="xs"
											onClick={() =>
												update({ models: draft.models.filter((_, at) => at !== index) })
											}
										>
											Remove
										</Button>
									</div>
								))
							)
						) : catalog.length === 0 ? (
							<p className="p-3 text-sm text-muted-foreground">
								pi exposes no model for this provider.
							</p>
						) : (
							catalog.map((model) => {
								const override = draft.modelOverrides[model.id];
								return (
									<div key={model.id} className="flex items-center gap-2 px-3 py-2">
										<span className="min-w-0 flex-1">
											<span className="block truncate text-sm font-medium">{model.name}</span>
											<span className="block truncate text-xs text-muted-foreground">
												{model.id}
											</span>
										</span>
										{override !== undefined && <Badge variant="outline">Override</Badge>}
										<Button
											type="button"
											variant="ghost"
											size="xs"
											onClick={() => setOverriding({ id: model.id, name: model.name, ...override })}
										>
											{override === undefined ? "Override" : "Edit override"}
										</Button>
										{override !== undefined && (
											<Button
												type="button"
												variant="destructive"
												size="xs"
												onClick={() => {
													const next = { ...draft.modelOverrides };
													delete next[model.id];
													update({ modelOverrides: next });
												}}
											>
												Clear
											</Button>
										)}
									</div>
								);
							})
						)}
					</div>
				</div>
			</SettingsBlock>

			{editing !== undefined && (
				<ProviderModelDialog
					key={`${editing.index ?? "new"}-${editing.model?.id ?? ""}`}
					open
					onOpenChange={() => setEditing(undefined)}
					title={editing.index === undefined ? "Add a model" : "Edit model"}
					description="Only the id is required. The rest uses pi's defaults when empty."
					model={editing.model}
					lockId={editing.index !== undefined}
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
					open
					onOpenChange={() => setOverriding(undefined)}
					title={`Override ${overriding.name ?? overriding.id}`}
					description="Changes apply to this model without replacing the catalog pi ships."
					model={overriding}
					lockId
					onSave={(model) =>
						update({
							modelOverrides: { ...draft.modelOverrides, [model.id]: overrideOf(model) },
						})
					}
				/>
			)}

			{importOpen && api !== undefined && (
				<ProviderImportDialog
					open
					onOpenChange={() => setImportOpen(false)}
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

			<AlertDialog
				open={replacing !== undefined}
				onOpenChange={(open) => {
					if (!open) setReplacing(undefined);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Replace pi's catalog for this provider?</AlertDialogTitle>
						<AlertDialogDescription>
							{replacing === "import" ? "Fetching models" : "Adding a model"} switches this provider
							to a custom catalog. Saving then replaces the {detail?.catalog.length ?? 0} models pi
							ships for it. Existing overrides are cleared. Use an override instead if you only want
							to change one model.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onClick={confirmReplace}>
							Replace catalog
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SettingsGroup>
	);
}
