/**
 * Fetch a provider's model list. The server reads it with the typed key or the
 * stored credential; the browser never sees the key. Only the OpenAI families and
 * Anthropic expose a list in this shape, so Google asks for models by hand.
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { providerModelsEndpoint } from "shared";
import type { ProviderApi, ProviderModelInput } from "shared";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { importProviderModels } from "@/lib/api";

export function ProviderImportDialog({
	open,
	onOpenChange,
	providerId,
	baseUrl,
	api,
	apiKey,
	onAdd,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	providerId: string | undefined;
	baseUrl: string;
	api: ProviderApi;
	apiKey: string;
	onAdd: (models: ProviderModelInput[]) => void;
}) {
	const models = useQuery({
		queryKey: ["provider-import", providerId, baseUrl, api, apiKey],
		queryFn: () =>
			importProviderModels({
				providerId,
				baseUrl,
				api,
				apiKey: apiKey.trim() || undefined,
			}),
		enabled: open,
		retry: false,
	});
	const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
	const endpoint = providerModelsEndpoint(api, baseUrl);
	const ids = models.data?.map((model) => model.id) ?? [];
	const selected = picked ?? new Set(ids);
	/** Reopening starts from every model again, whichever way the last one closed. */
	const close = (next: boolean) => {
		if (!next) setPicked(null);
		onOpenChange(next);
	};

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Fetch models from provider</DialogTitle>
					<DialogDescription>
						Models read from {endpoint ?? baseUrl}. Nothing is written until you save.
					</DialogDescription>
				</DialogHeader>
				{models.isPending ? (
					<div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
						<Spinner />
						Reading the model list…
					</div>
				) : models.error !== null ? (
					<Alert variant="destructive">
						<AlertDescription>{models.error.message}</AlertDescription>
					</Alert>
				) : models.data === undefined ? null : (
					<form
						onSubmit={(event) => {
							event.preventDefault();
							onAdd(models.data.filter((model) => selected.has(model.id)));
							close(false);
						}}
					>
						<div className="max-h-72 overflow-y-auto rounded-xl border p-2">
							{models.data.length === 0 ? (
								<p className="p-2 text-sm text-muted-foreground">
									The endpoint returned no models.
								</p>
							) : (
								<FieldGroup className="gap-1">
									{models.data.map((model) => (
										<Field
											key={model.id}
											orientation="horizontal"
											className="rounded-lg px-2 py-1.5 hover:bg-muted/60"
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
							)}
						</div>
						<DialogFooter className="mt-3">
							<Button type="button" variant="ghost" onClick={() => close(false)}>
								Cancel
							</Button>
							<Button type="submit" disabled={models.data.length === 0}>
								Add selected
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
