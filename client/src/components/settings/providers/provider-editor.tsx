/**
 * One provider, read and written. The form holds a draft so nothing is written
 * until Save; a new provider becomes a real route after its first save.
 */
import { Block, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeftIcon, TriangleAlertIcon } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "cn";
import type { ProviderDetail, ProviderModelInput, ThinkingLevel } from "shared";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useProviderDetail } from "@/hooks/use-provider-detail";
import { useSettings } from "@/hooks/use-settings";
import { deleteProvider, saveProvider, testProvider } from "@/lib/api";
import { useSettingsRefresh } from "@/components/settings/settings-refresh";

import { DeleteDialog } from "@/components/settings/delete-dialog";

import { keepUntouched } from "./field-errors";
import { draftOf, inputOf, testInputOf } from "./provider-draft";
import { providerIdFromName, uniqueProviderId } from "./provider-id";
import { providerFieldErrors, providerFields } from "./provider-validation";
import type { ProviderFieldErrors } from "./provider-validation";
import type { ProviderDraft } from "./provider-draft";
import { ProviderConnection } from "./provider-connection";
import { ProviderHeaders } from "./provider-headers";
import { ProviderCancelDialog } from "./provider-cancel-dialog";
import { ProviderDiscardDialog } from "./provider-discard-dialog";
import { ProviderModels } from "./provider-models";
import { ProviderTestMenu } from "./provider-test-menu";

export function ProviderEditor({ providerId }: { providerId?: string }) {
	const detail = useProviderDetail(providerId);
	if (providerId !== undefined) {
		if (detail.isPending) {
			return (
				<div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
					<Spinner />
					Reading the provider…
				</div>
			);
		}
		if (detail.error !== null) {
			return (
				<div className="flex h-full items-center justify-center p-6">
					<div className="grid w-full max-w-md gap-4">
						<Alert variant="destructive">
							<TriangleAlertIcon />
							<AlertTitle>This provider did not load</AlertTitle>
							<AlertDescription>{detail.error.message}</AlertDescription>
						</Alert>
						<Link
							to="/settings/providers"
							className={cn(buttonVariants({ variant: "outline" }), "w-fit")}
						>
							<ArrowLeftIcon />
							Back to providers
						</Link>
					</div>
				</div>
			);
		}
		if (detail.data === undefined) return null;
		return <ProviderForm key={detail.data.id} detail={detail.data} />;
	}
	return <ProviderForm detail={undefined} />;
}

function ProviderForm({ detail }: { detail: ProviderDetail | undefined }) {
	const navigate = useNavigate();
	const refresh = useSettingsRefresh();
	const [draft, setDraft] = useState<ProviderDraft>(() => draftOf(detail));
	const [dirty, setDirty] = useState(false);
	const [errors, setErrors] = useState<ProviderFieldErrors>({});
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [cancelOpen, setCancelOpen] = useState(false);
	const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | undefined>();
	const allowLeave = useRef(false);
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
	const existingNames = new Set<string>();
	for (const provider of settings.data?.providers ?? []) {
		if (provider.id !== detail?.id) existingNames.add(provider.name.trim().toLowerCase());
	}
	for (const provider of settings.data?.builtins ?? []) {
		if (provider.id !== detail?.id) existingNames.add(provider.name.trim().toLowerCase());
	}

	const update = (patch: Partial<ProviderDraft>) => {
		allowLeave.current = false;
		setDraft((current) => ({ ...current, ...patch }));
		setDirty(true);
		setTestResult(undefined);
		setErrors((current) => keepUntouched(current, providerFields, Object.keys(patch)));
	};

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
			setDirty(false);
			setTestResult(undefined);
			refresh();
			if (detail === undefined) {
				allowLeave.current = true;
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
			refresh();
			allowLeave.current = true;
			void navigate({ to: "/settings/providers" });
		},
	});

	const submit = () => {
		const found = validate();
		setErrors(found);
		if (Object.keys(found).length > 0) return;
		save.mutate(inputOf(draft, builtin));
	};

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-8 sm:px-8">
					<header className="grid gap-2">
						<Link
							to="/settings/providers"
							className={cn(
								buttonVariants({ variant: "ghost", size: "sm" }),
								"-ml-2 self-start md:hidden",
							)}
						>
							<ArrowLeftIcon />
							Providers
						</Link>
						<h1 className="truncate text-2xl font-semibold tracking-tight">
							{detail?.name ?? "New provider"}
						</h1>
					</header>

					<ProviderConnection
						draft={draft}
						errors={errors}
						builtin={builtin}
						onNameChange={updateName}
						hasKey={detail?.hasKey ?? false}
						configured={detail?.configured ?? false}
						namePlaceholder={detail?.name ?? "Display name"}
						update={update}
					/>
					<ProviderHeaders
						rows={draft.headers}
						error={errors.headers}
						onChange={(headers) => update({ headers })}
					/>
					<ProviderModels draft={draft} detail={detail} builtin={builtin} update={update} />

					{save.error !== null && (
						<Alert variant="destructive">
							<AlertDescription>{save.error.message}</AlertDescription>
						</Alert>
					)}
				</div>
			</div>

			{testResult !== undefined && (
				<div className="shrink-0 border-t">
					<div className="mx-auto w-full max-w-5xl px-5 py-3 sm:px-8">
						<Alert variant={testResult.ok ? "success" : "destructive"}>
							<AlertDescription className="break-words">{testResult.message}</AlertDescription>
						</Alert>
					</div>
				</div>
			)}

			<footer className="shrink-0 border-t">
				<div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-5 py-3 sm:px-8">
					<span className="text-xs text-muted-foreground">
						{dirty ? "Unsaved changes" : detail === undefined ? "Not saved yet" : ""}
					</span>
					<div className="flex items-center gap-2">
						<ProviderTestMenu models={testModels} pending={test.isPending} onPick={runTest} />
						{detail === undefined && (
							<Button type="button" variant="destructive" onClick={() => setCancelOpen(true)}>
								Cancel
							</Button>
						)}
						{detail !== undefined && (
							<Button
								type="button"
								variant="destructive"
								onClick={() => {
									remove.reset();
									setDeleteOpen(true);
								}}
							>
								Delete
							</Button>
						)}
						<Button type="button" onClick={submit} disabled={save.isPending}>
							{save.isPending && <Spinner data-icon="inline-start" />}
							Save
						</Button>
					</div>
				</div>
			</footer>

			{detail === undefined && (
				<ProviderCancelDialog
					open={cancelOpen}
					onOpenChange={setCancelOpen}
					onDiscard={() => {
						allowLeave.current = true;
						void navigate({ to: "/settings/providers" });
					}}
				/>
			)}

			<Block
				shouldBlockFn={() => dirty && !allowLeave.current}
				enableBeforeUnload={() => dirty && !allowLeave.current}
				withResolver
			>
				{({ status, proceed, reset }) =>
					status === "blocked" ? <ProviderDiscardDialog onStay={reset} onDiscard={proceed} /> : null
				}
			</Block>

			<DeleteDialog
				open={deleteOpen}
				title={`Remove ${detail?.name ?? draft.name}?`}
				description="The entry leaves models.json, and a credential stored in auth.json on the agent host is removed with it. A key that comes from the environment stays there."
				error={remove.error}
				pending={remove.isPending}
				onOpenChange={setDeleteOpen}
				onConfirm={() => {
					if (detail !== undefined) remove.mutate(detail.id);
				}}
			/>
		</div>
	);
}
