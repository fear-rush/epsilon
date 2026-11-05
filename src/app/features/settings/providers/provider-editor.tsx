import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";

import { providerApis } from "#domain/providers/rules";
import type {
	ProviderDetail,
	ProviderInput,
	ProviderModelInput,
} from "#protocol/settings/providers";
import { DeleteDialog } from "@/components/patterns/confirm-dialogs";
import { DetailPage } from "@/components/patterns/pane/detail-page";
import { Row } from "@/components/patterns/section/row";
import { Section } from "@/components/patterns/section/section";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

import { useSettingsRefresh } from "../queries.ts";
import { readProvider, removeProvider, saveProvider, setProviderKey } from "./api.ts";
import { ProviderSignIn } from "./provider-sign-in.tsx";

type Draft = {
	id: string;
	name: string;
	baseUrl: string;
	api: string;
	apiKey: string;
	models: ProviderModelInput[];
};

const EMPTY: Draft = {
	api: "openai-completions",
	apiKey: "",
	baseUrl: "",
	id: "",
	models: [{ id: "" }],
	name: "",
};

const BACK = { to: "/settings/providers", label: "Providers" } as const;

/** One provider: its connection, its models, its key and its sign-in. */
export function ProviderEditor({ providerId }: { providerId?: string | undefined }) {
	if (providerId === undefined) return <NewProvider />;
	return <ExistingProvider providerId={providerId} />;
}

function providerQuery(id: string) {
	return {
		queryKey: ["config", "providers", "detail", id],
		queryFn: () => readProvider(id),
	};
}

function NewProvider() {
	const navigate = useNavigate();
	const refresh = useSettingsRefresh();
	const [draft, setDraft] = useState<Draft>(EMPTY);
	const [error, setError] = useState<string | undefined>(undefined);
	const save = useMutation({
		mutationFn: (input: ProviderInput) => saveProvider(input),
		onSuccess: () => refresh(),
	});

	const submit = (): void => {
		const model = draft.models[0];
		const id = providerIdFromName(draft.name);
		if (
			draft.name.trim() === "" ||
			draft.baseUrl.trim() === "" ||
			model === undefined ||
			model.id.trim() === ""
		) {
			setError("A provider needs a name, a base URL and one model id");
			return;
		}
		const first: ProviderModelInput =
			model.name === undefined
				? { id: model.id.trim() }
				: { id: model.id.trim(), name: model.name };
		const input = withKey(
			{
				api: draft.api,
				baseUrl: draft.baseUrl.trim(),
				id,
				models: [first],
				name: draft.name.trim(),
			},
			draft.apiKey,
		);
		save.mutate(input, {
			onSuccess: () => {
				void navigate({
					params: { providerId: id },
					search: true,
					to: "/settings/providers/$providerId",
				});
			},
		});
	};

	return (
		<DetailPage
			back={BACK}
			title="New provider"
			footer={
				<Button type="button" disabled={save.isPending} onClick={submit}>
					{save.isPending ? "Saving…" : "Add provider"}
				</Button>
			}
		>
			<div className="grid gap-section">
				<ConnectionFields draft={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
				<ModelsSection draft={draft} onChange={(models) => setDraft({ ...draft, models })} />
				<Section
					description="A literal, $NAME or !command. A blank field stores no key."
					title="API key"
				>
					<div className="p-3">
						<Input
							aria-label="API key"
							autoComplete="off"
							placeholder="sk-…, $ENV_NAME or !command"
							type="password"
							value={draft.apiKey}
							onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
						/>
					</div>
				</Section>
				{error !== undefined && <Notice tone="danger">{error}</Notice>}
				{save.error !== null && <Notice error={save.error} title="The provider was not saved" />}
			</div>
		</DetailPage>
	);
}

function ExistingProvider({ providerId }: { providerId: string }) {
	const query = useQuery(providerQuery(providerId));
	if (query.isPending) {
		return (
			<DetailPage back={BACK} title={providerId}>
				<LoadingState label="Reading the provider…" />
			</DetailPage>
		);
	}
	if (query.error !== null) {
		return (
			<DetailPage back={BACK} title={providerId}>
				<StatusView error={query.error} />
			</DetailPage>
		);
	}
	return <ProviderBody detail={query.data} />;
}

function ProviderBody({ detail }: { detail: ProviderDetail }) {
	const navigate = useNavigate();
	const refresh = useSettingsRefresh();
	const [removing, setRemoving] = useState(false);
	const [key, setKey] = useState("");
	const [draft, setDraft] = useState<Draft>(() => ({
		api: detail.stored.api ?? "openai-completions",
		apiKey: "",
		baseUrl: detail.stored.baseUrl ?? "",
		id: detail.id,
		models:
			detail.catalog.length === 0
				? [{ id: "" }]
				: detail.catalog.map((model) => ({
						contextWindow: model.contextWindow,
						id: model.id,
						maxTokens: model.maxTokens,
						name: model.name,
					})),
		name: detail.stored.name ?? detail.name,
	}));
	const [error, setError] = useState<string | undefined>(undefined);

	const save = useMutation({
		mutationFn: (input: ProviderInput) => saveProvider(input),
		onSuccess: () => refresh(),
	});
	const remove = useMutation({
		mutationFn: () => removeProvider(detail.id),
		onSuccess: () => {
			void navigate({ search: true, to: "/settings/providers" });
			refresh();
		},
	});
	const saveKey = useMutation({
		mutationFn: (value: string) => setProviderKey(detail.id, value),
		onSuccess: () => {
			setKey("");
			refresh();
		},
	});

	const custom = detail.custom;
	const submit = (): void => {
		const models = draft.models.filter((model) => model.id.trim() !== "");
		if (draft.name.trim() === "" || draft.baseUrl.trim() === "" || models.length === 0) {
			setError("A provider needs a name, a base URL and one model id");
			return;
		}
		setError(undefined);
		save.mutate(
			withKey(
				{
					api: draft.api,
					baseUrl: draft.baseUrl.trim(),
					id: detail.id,
					models,
					name: draft.name.trim(),
				},
				draft.apiKey,
			),
		);
	};

	return (
		<DetailPage
			back={BACK}
			title={detail.name}
			actions={
				<>
					{custom && (
						<Button
							variant="destructive"
							size="icon-sm"
							aria-label="Remove provider"
							onClick={() => {
								remove.reset();
								setRemoving(true);
							}}
						>
							<Trash2Icon />
						</Button>
					)}
				</>
			}
			footer={
				custom ? (
					<Button type="button" disabled={save.isPending} onClick={submit}>
						{save.isPending ? "Saving…" : "Save"}
					</Button>
				) : undefined
			}
		>
			<div className="grid gap-section">
				{custom ? (
					<ConnectionFields draft={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
				) : (
					<Section title="Connection">
						<Row title="Provider">{detail.id}</Row>
						<Row title="Models">{String(detail.catalog.length)}</Row>
						<Row
							title="Credential"
							description={detail.sourceLabel ?? detail.source ?? "none stored on this machine"}
						/>
					</Section>
				)}

				<Section
					description={
						detail.hasKey
							? "A key is stored in models.json; a blank field keeps it."
							: "pi has no key for this provider in models.json."
					}
					title="API key"
				>
					<div className="flex gap-2 p-3">
						<Input
							aria-label="API key"
							autoComplete="off"
							placeholder="sk-…, $ENV_NAME or !command"
							type="password"
							value={custom ? draft.apiKey : key}
							onChange={(event) =>
								custom
									? setDraft({ ...draft, apiKey: event.target.value })
									: setKey(event.target.value)
							}
						/>
						{!custom && (
							<Button
								type="button"
								variant="outline"
								disabled={key.trim() === "" || saveKey.isPending}
								onClick={() => saveKey.mutate(key.trim())}
							>
								Save key
							</Button>
						)}
					</div>
				</Section>

				{custom && (
					<ModelsSection draft={draft} onChange={(models) => setDraft({ ...draft, models })} />
				)}

				{error !== undefined && <Notice tone="danger">{error}</Notice>}
				{save.error !== null && <Notice error={save.error} title="The provider was not saved" />}
				{saveKey.error !== null && <Notice error={saveKey.error} title="The key was not saved" />}
			</div>

			<ProviderSignIn detail={detail} />
			<DeleteDialog
				open={removing}
				title={`Remove ${detail.name}?`}
				description="Its models.json entry is removed; pi's own catalog is untouched."
				error={remove.error}
				pending={remove.isPending}
				onOpenChange={setRemoving}
				onConfirm={() => remove.mutate()}
			/>
		</DetailPage>
	);
}

function ConnectionFields({
	draft,
	onChange,
}: {
	draft: Draft;
	onChange: (patch: Partial<Draft>) => void;
}) {
	return (
		<Section title="Connection">
			<Row stacked title="Name">
				<Input
					aria-label="Name"
					value={draft.name}
					onChange={(event) => onChange({ name: event.target.value })}
				/>
			</Row>
			<Row
				stacked
				title="Base URL"
				description="The endpoint pi's client appends its family's path to."
			>
				<Input
					aria-label="Base URL"
					placeholder="https://api.example.com/v1"
					value={draft.baseUrl}
					onChange={(event) => onChange({ baseUrl: event.target.value })}
				/>
			</Row>
			<Row stacked title="API family">
				<Select
					value={draft.api}
					onValueChange={(api) => {
						if (api !== null) onChange({ api });
					}}
				>
					<SelectTrigger aria-label="API family">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{providerApis.map((api) => (
							<SelectItem key={api} value={api}>
								{api}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Row>
		</Section>
	);
}

function ModelsSection({
	draft,
	onChange,
}: {
	draft: Draft;
	onChange: (models: ProviderModelInput[]) => void;
}) {
	const update = (index: number, patch: Partial<ProviderModelInput>): void =>
		onChange(draft.models.map((model, at) => (at === index ? { ...model, ...patch } : model)));
	return (
		<Section
			description="The models this provider offers. A blank first field removes the row."
			title="Models"
		>
			{draft.models.map((model, index) => (
				// oxlint-disable-next-line react/no-array-index-key -- a new model row has no id yet
				<div key={index} className="grid gap-2 p-3 sm:grid-cols-3">
					<Field data-invalid={model.id.trim() === ""}>
						<FieldLabel htmlFor={`model-id-${index}`} className="sr-only">
							Model id
						</FieldLabel>
						<Input
							id={`model-id-${index}`}
							aria-label="Model id"
							placeholder="model-id"
							value={model.id}
							onChange={(event) => update(index, { id: event.target.value })}
						/>
						{model.id.trim() === "" && <FieldError>A model needs an id</FieldError>}
					</Field>
					<Input
						aria-label="Model name"
						placeholder="Display name"
						value={model.name ?? ""}
						onChange={(event) => update(index, { name: event.target.value })}
					/>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Remove model"
						onClick={() => onChange(draft.models.filter((_, at) => at !== index))}
					>
						<Trash2Icon />
					</Button>
				</div>
			))}
			<div className="p-3">
				<Button
					type="button"
					variant="outline"
					onClick={() => onChange([...draft.models, { id: "" }])}
				>
					Add model
				</Button>
			</div>
		</Section>
	);
}

/** A blank key field keeps the stored one; the server applies that. */
const withKey = (input: ProviderInput, apiKey: string): ProviderInput =>
	apiKey.trim() === "" ? input : { ...input, apiKey: apiKey.trim() };

/** pi's id rule, and a slug for a new provider's `models.json` key. */
function providerIdFromName(name: string): string {
	const slug = name
		.normalize("NFKD")
		.replaceAll(/[\u0300-\u036f]/gu, "")
		.toLowerCase()
		.replaceAll(/[^a-z0-9_-]+/gu, "-")
		.replaceAll(/-{2,}/gu, "-")
		.replaceAll(/^-+|-+$/gu, "")
		.slice(0, 40)
		.replaceAll(/-+$/gu, "");
	return slug === "" ? "provider" : slug;
}
