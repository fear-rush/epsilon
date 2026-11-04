import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import type { ProviderInput } from "#protocol/config/providers";
import { Pane } from "@/components/patterns/pane/pane";
import { PaneBar } from "@/components/patterns/pane/pane-bar";
import { PaneBody } from "@/components/patterns/pane/pane-body";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { call } from "@/runtime";

/**
 * Settings → Providers: what pi composed, and the `models.json` entries Epsilon may add.
 *
 * A provider is pi's, not Epsilon's: the write goes through the same file pi reads, and the
 * key goes into the same credential file a terminal `pi` uses. The credential never travels
 * back: the list carries only the source pi reports.
 */
const providersQuery = {
	queryKey: ["config", "providers"],
	queryFn: ({ signal }: { signal: AbortSignal }) =>
		call((client) => client["config.providers.list"](), { signal }),
};

/** pi's default API family for an OpenAI-compatible endpoint. */
const DEFAULT_API = "openai-completions";

/** A provider id from a base URL: the host, kept to the characters pi accepts. */
const idOf = (baseUrl: string): string => {
	const host = baseUrl.replace(/^[a-z]+:\/\//i, "").split("/")[0] ?? "";
	const cleaned = host.split(":")[0]?.replaceAll(/[^A-Za-z0-9_-]/g, "-") ?? "";
	return cleaned === "" ? "custom" : cleaned;
};

export function SettingsProviders() {
	const queryClient = useQueryClient();
	const providers = useQuery(providersQuery);
	const [adding, setAdding] = useState(false);

	if (providers.isPending) {
		return (
			<Pane className="flex-1">
				<PaneBar title="Providers" />
				<div className="flex flex-1 items-center justify-center">
					<LoadingState label="Asking pi for its providers…" />
				</div>
			</Pane>
		);
	}

	if (providers.error !== null) {
		const view = errorView(providers.error);
		return (
			<Pane className="flex-1">
				<PaneBar title="Providers" />
				<StatusView icon={view.icon} title={view.title} line={view.line} tone={view.tone} />
			</Pane>
		);
	}

	const view = providers.data;

	return (
		<Pane className="flex-1">
			<PaneBar
				title="Providers"
				actions={
					<Button size="sm" variant="outline" onClick={() => setAdding(true)}>
						<PlusIcon />
						Add provider
					</Button>
				}
			/>
			<PaneBody page>
				{view.error !== undefined && (
					<Notice tone="warning" title="pi could not compose its provider catalog">
						{view.error}
					</Notice>
				)}

				<Section
					title="Providers pi can reach"
					description="Built-in providers come from pi; a provider with a key below is ready for a chat."
				>
					{view.providers.length === 0 ? (
						<Row
							title="No provider yet"
							description="Add one here, or run pi's own login in a terminal."
						/>
					) : (
						view.providers.map((provider) => (
							<Row
								key={provider.id}
								title={provider.name}
								description={`${provider.id} · ${provider.models} ${provider.models === 1 ? "model" : "models"}${provider.auth.label === undefined ? "" : ` · ${provider.auth.label}`}`}
							>
								{provider.builtin ? <Badge variant="outline">built in</Badge> : null}
								{provider.auth.configured ? (
									<Badge variant="secondary">key set</Badge>
								) : (
									<Badge variant="warning">no key</Badge>
								)}
							</Row>
						))
					)}
				</Section>
			</PaneBody>

			<AddProviderDialog
				open={adding}
				onOpenChange={setAdding}
				onSaved={() => {
					setAdding(false);
					void queryClient.invalidateQueries({ queryKey: ["config"] });
				}}
			/>
		</Pane>
	);
}

/**
 * The add form. Only the three facts a reachable endpoint needs are asked for: the base
 * URL, the key and a model id. The provider id is derived from the host unless one is
 * typed, so a first provider takes three fields and no vocabulary.
 */
function AddProviderDialog({
	open,
	onOpenChange,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [failure, setFailure] = useState<string | undefined>(undefined);
	const [baseUrl, setBaseUrl] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [model, setModel] = useState("");
	const [typedId, setTypedId] = useState("");
	const save = useMutation({
		mutationFn: (input: ProviderInput) => call((client) => client["config.providers.save"](input)),
		onSuccess: onSaved,
		onError: (error: Error) =>
			setFailure(error.message === "" ? "pi refused this provider." : error.message),
	});

	const submit = (event: React.SyntheticEvent<HTMLFormElement>): void => {
		event.preventDefault();
		const url = baseUrl.trim();
		const modelId = model.trim();
		if (url === "" || modelId === "") {
			setFailure("A base URL and a model id are required.");
			return;
		}
		const id = typedId.trim() === "" ? idOf(url) : typedId.trim();
		const base = {
			api: DEFAULT_API,
			baseUrl: url,
			id,
			models: [{ id: modelId }],
			name: typedId.trim() === "" ? id : typedId.trim(),
		};
		setFailure(undefined);
		save.mutate(apiKey.trim() === "" ? base : { ...base, apiKey: apiKey.trim() });
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add a provider</DialogTitle>
					<DialogDescription>
						Written to pi&apos;s <code>models.json</code>; a key is stored where pi stores its
						credentials.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="grid gap-4">
					<Field>
						<FieldLabel htmlFor="provider-base-url">Base URL</FieldLabel>
						<Input
							id="provider-base-url"
							value={baseUrl}
							placeholder="http://127.0.0.1:11434/v1"
							autoComplete="off"
							onChange={(event) => setBaseUrl(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="provider-api-key">API key</FieldLabel>
						<Input
							id="provider-api-key"
							type="password"
							value={apiKey}
							autoComplete="off"
							onChange={(event) => setApiKey(event.target.value)}
						/>
						<FieldDescription>Leave it empty for an endpoint that needs no key.</FieldDescription>
					</Field>
					<Field>
						<FieldLabel htmlFor="provider-model">Model</FieldLabel>
						<Input
							id="provider-model"
							value={model}
							placeholder="gpt-4o-mini"
							autoComplete="off"
							onChange={(event) => setModel(event.target.value)}
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="provider-id">Provider id</FieldLabel>
						<Input
							id="provider-id"
							value={typedId}
							placeholder="From the base URL"
							autoComplete="off"
							onChange={(event) => setTypedId(event.target.value)}
						/>
					</Field>
					{failure !== undefined && (
						<Notice tone="error" title="The provider was not saved">
							{failure}
						</Notice>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={save.isPending}>
							Save
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
