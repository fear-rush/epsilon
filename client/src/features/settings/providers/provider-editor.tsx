/**
 * One provider, read and written. The form holds a draft so nothing is written
 * until Save; a new provider becomes a real route after its first save.
 */
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { ThinkingLevel } from "shared";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { useProviderDetail } from "@/features/settings/queries";
import { useSettings } from "@/features/settings/queries";
import { deleteProvider, saveProvider, testProvider } from "@/api/endpoints";
import { useSettingsRefresh } from "@/features/settings/queries";
import { DeleteDialog } from "@/features/settings/kit/dialogs";
import { DetailLoader } from "@/features/settings/kit/detail-loader";
import { FormFooter, FormPage } from "@/features/settings/kit/form-page";
import { UnsavedChangesBlock } from "@/features/settings/kit/dialogs";
import { useDraftForm } from "@/features/settings/kit/use-draft-form";
import { PairRows } from "@/features/settings/kit/pair-rows";
import { draftOf, inputOf, testInputOf } from "./provider-draft";
import { providerIdFromName, providerNamesInUse, uniqueProviderId } from "./provider-draft";
import { providerFieldErrors, providerFields } from "./provider-validation";
import type { ProviderField } from "./provider-validation";
import type { ProviderDraft } from "./provider-draft";
import { ProviderConnection } from "./provider-connection";
import { CancelDialog } from "@/features/settings/kit/dialogs";
import { ProviderModels } from "./provider-models";
import { ProviderTestMenu } from "./provider-test-menu";
import type { ProviderDetail, ProviderModelInput } from "@/api/types";

export function ProviderEditor({ providerId }: { providerId?: string }) {
	const query = useProviderDetail(providerId);
	return (
		<DetailLoader
			query={query}
			reading={providerId !== undefined}
			noun="provider"
			backTo="/settings/providers"
			backLabel="providers"
		>
			{(detail) => <ProviderForm key={detail?.id} detail={detail} />}
		</DetailLoader>
	);
}

function ProviderForm({ detail }: { detail: ProviderDetail | undefined }) {
	const navigate = useNavigate();
	const refresh = useSettingsRefresh();
	const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | undefined>();
	const form = useDraftForm<ProviderDraft, ProviderField>({
		initial: () => draftOf(detail),
		fields: providerFields,
		onEdit: () => setTestResult(undefined),
	});
	const { draft, update, setErrors } = form;
	const builtin = detail?.builtin ?? false;
	const settings = useSettings();
	const testModels: ProviderModelInput[] =
		draft.models.length > 0
			? draft.models
			: (detail?.catalog ?? []).map((model) => ({ id: model.id, name: model.name }));
	const taken = new Set([
		...(settings.data?.providers ?? []).map((provider) => provider.id),
		...(settings.data?.builtins ?? []).map((provider) => provider.id),
	]);
	if (detail !== undefined) taken.delete(detail.id);

	/** Names already in use, so a second provider cannot carry the same label. */
	const existingNames = providerNamesInUse(
		settings.data?.providers ?? [],
		settings.data?.builtins ?? [],
		detail?.id,
	);

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
		if (Object.keys(found).length > 0) return;
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
		mutationFn: deleteProvider,
		onSuccess: () => {
			form.allowLeave();
			// Leave first: a refresh while this page is mounted refetches the deleted entry.
			void navigate({ to: "/settings/providers" }).then(refresh);
		},
	});

	const submit = () => {
		const found = validate();
		setErrors(found);
		if (Object.keys(found).length > 0) return;
		save.mutate(inputOf(draft, builtin));
	};

	return (
		<FormPage
			backTo="/settings/providers"
			backLabel="Providers"
			title={detail?.name ?? "New provider"}
			footer={
				<>
					{testResult !== undefined && (
						<div className="shrink-0 border-t">
							<div className="mx-auto w-full max-w-5xl px-5 py-3 sm:px-8">
								<Alert variant={testResult.ok ? "success" : "destructive"}>
									<AlertDescription className="break-words">{testResult.message}</AlertDescription>
								</Alert>
							</div>
						</div>
					)}
					<FormFooter
						dirty={form.dirty}
						isNew={detail === undefined}
						saving={save.isPending}
						onSave={submit}
						onCancel={() => form.setCancelOpen(true)}
						onDelete={() => {
							remove.reset();
							form.setDeleteOpen(true);
						}}
						extra={
							<ProviderTestMenu models={testModels} pending={test.isPending} onPick={runTest} />
						}
					/>
				</>
			}
		>
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
			<ProviderModels draft={draft} detail={detail} builtin={builtin} update={update} />

			{save.error !== null && (
				<Alert variant="destructive">
					<AlertDescription>{save.error.message}</AlertDescription>
				</Alert>
			)}

			{detail === undefined && (
				<CancelDialog
					open={form.cancelOpen}
					title="Cancel this provider?"
					description="Nothing is saved until you press Save. The name, endpoint, key and models you entered will be lost."
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
				description="The entry leaves models.json, and a credential stored in auth.json on the agent host is removed with it. A key that comes from the environment stays there."
				error={remove.error}
				pending={remove.isPending}
				onOpenChange={form.setDeleteOpen}
				onConfirm={() => {
					if (detail !== undefined) remove.mutate(detail.id);
				}}
			/>
		</FormPage>
	);
}
