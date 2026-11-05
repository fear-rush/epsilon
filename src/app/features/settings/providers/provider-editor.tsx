/**
 * One provider, read and written. The form holds a draft so nothing is written
 * until Save; a new provider becomes a real route after its first save.
 */
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import type { ThinkingLevel } from "#protocol/conversation/session";
import type { ProviderDetail, ProviderModelInput } from "#protocol/settings/providers";
import {
	CancelDialog,
	DeleteDialog,
	UnsavedChangesBlock,
} from "@/components/patterns/confirm-dialogs";
import { DetailPage } from "@/components/patterns/pane/detail-page";
import { CollapsibleSection } from "@/components/patterns/section/collapsible-section";
import { PairRows } from "@/components/patterns/section/pair-rows";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { useDraftForm } from "@/components/patterns/use-draft-form";

import { useProviderDetail, useSettings, useSettingsRefresh } from "../queries.ts";
import { removeProvider, saveProvider, testProvider } from "./api.ts";
import { ProviderConnection } from "./provider-connection.tsx";
import {
	draftOf,
	inputOf,
	providerIdFromName,
	providerNamesInUse,
	testInputOf,
	uniqueProviderId,
} from "./provider-draft.ts";
import type { ProviderDraft } from "./provider-draft.ts";
import { ProviderActions } from "./provider-footer.tsx";
import { ProviderModels } from "./provider-models.tsx";
import { ProviderSignIn } from "./provider-sign-in.tsx";
import { ProviderTestMenu } from "./provider-test-menu.tsx";
import { providerFieldErrors, providerFields } from "./provider-validation.ts";
import type { ProviderField } from "./provider-validation.ts";

const BACK = { to: "/settings/providers", label: "Providers" } as const;

export function ProviderEditor({ providerId }: { providerId?: string | undefined }) {
	const query = useProviderDetail(providerId);
	if (providerId === undefined) return <ProviderForm detail={undefined} />;
	if (query.isPending || query.error !== null) {
		return (
			<DetailPage title="Provider" back={BACK}>
				{query.error === null ? (
					<LoadingState label="Reading the provider…" />
				) : (
					<StatusView error={query.error} />
				)}
			</DetailPage>
		);
	}
	return <ProviderForm key={query.data.id} detail={query.data} />;
}

function ProviderForm({ detail }: { detail: ProviderDetail | undefined }) {
	const navigate = useNavigate();
	const refresh = useSettingsRefresh();
	const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | undefined>();
	// The override panel is closed until it is needed, including when a field inside it
	// fails validation, so an error is never hidden behind a closed row.
	const [overrideOpen, setOverrideOpen] = useState(false);
	const form = useDraftForm<ProviderDraft, ProviderField>({
		initial: () => draftOf(detail),
		fields: providerFields,
		onEdit: () => setTestResult(undefined),
	});
	const { draft, update, setErrors } = form;
	const builtin = detail?.builtin ?? false;
	const settings = useSettings();
	const providers = settings.data?.providers.providers ?? [];
	const builtins = settings.data?.providers.builtins ?? [];
	const testModels: readonly ProviderModelInput[] =
		draft.models.length > 0
			? draft.models
			: (detail?.catalog ?? []).map((model) =>
					model.name === undefined ? { id: model.id } : { id: model.id, name: model.name },
				);
	const taken = new Set([
		...providers.map((provider) => provider.id),
		...builtins.map((provider) => provider.id),
	]);
	if (detail !== undefined) taken.delete(detail.id);

	/** Names already in use, so a second provider cannot carry the same label. */
	const existingNames = providerNamesInUse(providers, builtins, detail?.id);

	/** The id stays out of the form; a new provider derives it from its name. */
	const updateName = (name: string) => {
		update(
			detail === undefined
				? { name, id: uniqueProviderId(providerIdFromName(name), taken) }
				: { name },
		);
	};

	const validate = () =>
		providerFieldErrors(draft, builtin, {
			takenIds: taken,
			takenNames: existingNames,
			nameRequired: detail === undefined,
		});

	const test = useMutation({
		mutationFn: testProvider,
		onSuccess: (message) => setTestResult({ ok: true, message }),
		onError: (error) => setTestResult({ ok: false, message: error.message }),
	});

	const runTest = (model: ProviderModelInput, level?: ThinkingLevel) => {
		const found = validate();
		setErrors(found);
		if (Object.keys(found).length > 0) {
			setOverrideOpen(true);
			return;
		}
		test.mutate(testInputOf(draft, model, level));
	};

	const save = useMutation({
		mutationFn: saveProvider,
		onSuccess: () => {
			form.markSaved();
			setTestResult(undefined);
			refresh();
			if (detail === undefined) {
				form.allowLeave();
				void navigate({
					to: "/settings/providers/$providerId",
					params: { providerId: draft.id.trim() },
					replace: true,
				});
			}
		},
	});
	const remove = useMutation({
		mutationFn: removeProvider,
		onSuccess: () => {
			form.allowLeave();
			// Leave first: a refresh while this page is mounted refetches the deleted entry.
			void navigate({ to: "/settings/providers" }).then(refresh);
		},
	});

	const submit = () => {
		const found = validate();
		setErrors(found);
		if (Object.keys(found).length > 0) {
			setOverrideOpen(true);
			return;
		}
		save.mutate(inputOf(draft, builtin));
	};

	/**
	 * A provider pi ships and an account can sign in to needs none of the endpoint
	 * fields: pi supplies the endpoint, the API family and the catalog, and the
	 * credential supplies the auth. They stay as an override, closed by default, so the
	 * page leads with the one thing that has to be chosen.
	 */
	const collapsible =
		builtin && detail !== undefined && !detail.custom && detail.auth.oauth !== undefined;

	const connection = (
		<>
			<ProviderConnection
				draft={draft}
				errors={form.errors}
				builtin={builtin}
				onNameChange={updateName}
				hasKey={detail?.hasKey ?? false}
				configured={detail?.configured ?? false}
				namePlaceholder={detail?.name ?? "Display name"}
				update={update}
			/>
			<PairRows
				title="Custom Headers"
				addLabel="Add custom headers"
				keyLabel="Header name"
				valueLabel="Header value"
				rows={draft.headers}
				error={form.errors.headers}
				onChange={(headers) => update({ headers })}
			/>
		</>
	);

	return (
		<DetailPage
			title={detail?.name ?? "New provider"}
			back={BACK}
			footerStatus={
				form.dirty ? "Unsaved changes" : detail === undefined ? "Not saved yet" : undefined
			}
			footer={
				<ProviderActions
					isNew={detail === undefined}
					saving={save.isPending}
					onSave={submit}
					onCancel={() => form.setCancelOpen(true)}
					onDelete={() => {
						remove.reset();
						form.setDeleteOpen(true);
					}}
					test={<ProviderTestMenu models={testModels} pending={test.isPending} onPick={runTest} />}
				/>
			}
		>
			{testResult !== undefined && (
				<Notice tone={testResult.ok ? "success" : "danger"}>{testResult.message}</Notice>
			)}
			{detail !== undefined && <ProviderSignIn detail={detail} />}
			{/* An account provider already has pi's endpoint and catalog, so those fields are
			    an override rather than part of adding it. */}
			{collapsible ? (
				<CollapsibleSection
					title="Endpoint, key and headers"
					open={overrideOpen}
					onOpenChange={setOverrideOpen}
				>
					{connection}
				</CollapsibleSection>
			) : (
				connection
			)}
			<ProviderModels
				draft={draft}
				detail={detail}
				builtin={builtin}
				// An account page is about the account: pi owns the catalog there, and
				// replacing it belongs with the endpoint override.
				catalogEditable={!collapsible}
				update={update}
			/>

			{save.error !== null && <Notice error={save.error} />}

			{detail === undefined && (
				<CancelDialog
					open={form.cancelOpen}
					title="Cancel this provider?"
					description="The entered name, endpoint, key and models are lost."
					onOpenChange={form.setCancelOpen}
					onDiscard={() => {
						form.allowLeave();
						void navigate({ to: "/settings/providers" });
					}}
				/>
			)}

			<UnsavedChangesBlock blocked={form.blocked} subject="provider" />

			<DeleteDialog
				open={form.deleteOpen}
				title={`Remove ${detail?.name ?? draft.name}?`}
				description="Removes its models.json entry. A stored credential stays in auth.json; sign out before deleting if you want it gone."
				error={remove.error}
				pending={remove.isPending}
				onOpenChange={form.setDeleteOpen}
				onConfirm={() => {
					if (detail !== undefined) remove.mutate(detail.id);
				}}
			/>
		</DetailPage>
	);
}
