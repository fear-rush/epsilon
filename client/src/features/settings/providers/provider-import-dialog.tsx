/**
 * Fetch a provider's model list. The server reads it with the typed key or the
 * stored credential; the browser never sees the key. Only the OpenAI families and
 * Anthropic expose a list in this shape, so Google asks for models by hand.
 */
import { InboxIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { providerModelsEndpoint } from "shared";
import type { ProviderApi } from "shared";

import { DialogFrame } from "@/components/patterns/dialog/dialog-frame";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { useDialogMotion } from "@/hooks/use-dialog-motion";
import { probeKeys } from "@/api/keys";
import { importProviderModels } from "@/api/endpoints";
import type { ProviderModelInput } from "@/api/types";

export function ProviderImportDialog({
	onClose,
	providerId,
	baseUrl,
	api,
	apiKey,
	onAdd,
}: {
	/** Runs once the dialog finished closing, which is when its mount can drop it. */
	onClose: () => void;
	providerId: string | undefined;
	baseUrl: string;
	api: ProviderApi;
	apiKey: string;
	onAdd: (models: ProviderModelInput[]) => void;
}) {
	const dialog = useDialogMotion();
	const models = useQuery({
		queryKey: probeKeys.providerModels(providerId, baseUrl, api, apiKey),
		queryFn: () =>
			importProviderModels({
				providerId,
				baseUrl,
				api,
				apiKey: apiKey.trim() || undefined,
			}),
		enabled: dialog.open,
		retry: false,
	});
	const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
	const endpoint = providerModelsEndpoint(api, baseUrl);
	const ids = models.data?.map((model) => model.id) ?? [];
	const selected = picked ?? new Set(ids);
	/** Reopening starts from every model again, whichever way the last one closed. */
	const close = () =>
		dialog.close(() => {
			setPicked(null);
			onClose();
		});

	return (
		<DialogFrame
			open={dialog.open}
			onOpenChange={(next) => {
				if (!next) close();
			}}
			size="md"
			title="Fetch models from provider"
			description={endpoint ?? baseUrl}
			footer={
				<>
					<Button type="button" variant="destructive" onClick={close}>
						Cancel
					</Button>
					<Button
						type="submit"
						form="import-form"
						disabled={models.data === undefined || models.data.length === 0}
					>
						Add selected
					</Button>
				</>
			}
		>
			{models.isPending ? (
				<LoadingState label="Reading the model list…" />
			) : models.error !== null ? (
				<Notice tone="error">{models.error.message}</Notice>
			) : models.data === undefined ? null : models.data.length === 0 ? (
				<StatusView icon={InboxIcon} title="No models returned" />
			) : (
				<form
					id="import-form"
					onSubmit={(event) => {
						event.preventDefault();
						if (!dialog.open) return;
						onAdd(models.data.filter((model) => selected.has(model.id)));
						close();
					}}
				>
					<FieldGroup className="gap-row">
						{models.data.map((model) => (
							<Field
								key={model.id}
								orientation="horizontal"
								className="rounded-md pad-item hover:bg-muted/60"
							>
								<Checkbox
									id={`import-${model.id}`}
									checked={selected.has(model.id)}
									onCheckedChange={() =>
										setPicked(() => {
											const next = new Set(selected);
											if (next.has(model.id)) next.delete(model.id);
											else next.add(model.id);
											return next;
										})
									}
								/>
								<FieldLabel
									htmlFor={`import-${model.id}`}
									className="min-w-0 flex-1 truncate font-normal"
								>
									{model.id}
								</FieldLabel>
							</Field>
						))}
					</FieldGroup>
				</form>
			)}
		</DialogFrame>
	);
}
