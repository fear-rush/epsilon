/**
 * One provider, read and written. The form holds a draft so nothing is written
 * until Save; a new provider becomes a real route after its first save.
 */
import { Block, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import { useRef, useState } from "react";
import type { ProviderDetail } from "shared";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Spinner } from "@/components/ui/spinner";
import { useProviderDetail } from "@/hooks/use-provider-detail";
import { deleteProvider, saveProvider } from "@/lib/api";
import { useSettingsRefresh } from "@/components/settings/settings-refresh";

import { draftOf, inputOf } from "./provider-draft";
import { providerFieldErrors, providerFields } from "./provider-validation";
import type { ProviderFieldErrors } from "./provider-validation";
import type { ProviderDraft } from "./provider-draft";
import { ProviderConnection } from "./provider-connection";
import { ProviderHeaders } from "./provider-headers";
import { ProviderModels } from "./provider-models";

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
				<div className="grid gap-3 p-6">
					<Alert variant="destructive">
						<AlertDescription>{detail.error.message}</AlertDescription>
					</Alert>
					<Link to="/settings/providers" className="text-sm underline">
						Back to providers
					</Link>
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
	const allowLeave = useRef(false);
	const builtin = detail?.builtin ?? false;

	const update = (patch: Partial<ProviderDraft>) => {
		allowLeave.current = false;
		setDraft((current) => ({ ...current, ...patch }));
		setDirty(true);
		setErrors((current) => {
			const touched = new Set(Object.keys(patch));
			const next: ProviderFieldErrors = {};
			for (const field of providerFields) {
				const message = current[field];
				if (message !== undefined && !touched.has(field)) next[field] = message;
			}
			return next;
		});
	};

	const save = useMutation({
		mutationFn: saveProvider,
		onSuccess: () => {
			setDirty(false);
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
		const found = providerFieldErrors(draft, builtin);
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
							className="flex items-center gap-1 text-sm text-muted-foreground md:hidden"
						>
							<ArrowLeftIcon className="size-4" />
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
						lockId={detail !== undefined}
						hasKey={detail?.hasKey ?? false}
						configured={detail?.configured ?? false}
						namePlaceholder={detail?.name ?? "Display name"}
						update={update}
					/>
					<ProviderHeaders rows={draft.headers} onChange={(headers) => update({ headers })} />
					<ProviderModels draft={draft} detail={detail} builtin={builtin} update={update} />

					{save.error !== null && (
						<Alert variant="destructive">
							<AlertDescription>{save.error.message}</AlertDescription>
						</Alert>
					)}
				</div>
			</div>

			<footer className="shrink-0 border-t">
				<div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-5 py-3 sm:px-8">
					<span className="text-xs text-muted-foreground">
						{dirty ? "Unsaved changes" : detail === undefined ? "Not saved yet" : ""}
					</span>
					<div className="flex items-center gap-2">
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

			<Block
				shouldBlockFn={() => dirty && !allowLeave.current}
				enableBeforeUnload={() => dirty && !allowLeave.current}
				withResolver
			>
				{({ status, proceed, reset }) =>
					status === "blocked" ? (
						<AlertDialog
							open
							onOpenChange={(open) => {
								if (!open) reset();
							}}
						>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
									<AlertDialogDescription>
										This provider has changes that are not saved. Leaving now loses them.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel onClick={reset}>Stay</AlertDialogCancel>
									<AlertDialogAction variant="destructive" onClick={proceed}>
										Discard changes
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					) : null
				}
			</Block>

			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove {detail?.name ?? draft.name}?</AlertDialogTitle>
						<AlertDialogDescription>
							The entry leaves models.json, and a credential stored in auth.json on the agent host
							is removed with it. A key that comes from the environment stays there.
						</AlertDialogDescription>
					</AlertDialogHeader>
					{remove.error !== null && (
						<Alert variant="destructive">
							<AlertDescription>{remove.error.message}</AlertDescription>
						</Alert>
					)}
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={remove.isPending}
							onClick={() => {
								if (detail !== undefined) remove.mutate(detail.id);
							}}
						>
							{remove.isPending && <Spinner data-icon="inline-start" />}
							Remove
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
