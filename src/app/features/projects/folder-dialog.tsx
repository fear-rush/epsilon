/**
 * Pick a folder for a project, then trust it before anything happens there. The app
 * never sends a path it made up: the server lists folders (names only), bounds the walk
 * and resolves a typed path, and the following status read is pi's own trust answer.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon, InboxIcon } from "lucide-react";
import { useState } from "react";

import type { ProjectStatus, ProjectTrustAction } from "#protocol/settings/projects";
import { DialogFrame } from "@/components/patterns/dialog-frame";
import { InlineStatus } from "@/components/patterns/status/inline-status";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Tip } from "@/components/patterns/tip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { call } from "@/core/runtime";

import { useSetProjectTrust } from "./queries.ts";
import { TrustNotice } from "./trust-notice.tsx";

type FolderDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	/** The verb on the final button: "Open" or "Move". */
	action: string;
	/** Projects that already have sessions, offered first. */
	recent: ProjectStatus[];
	/** Called with a trusted folder. A rejection is shown in the dialog. */
	onPick: (path: string) => Promise<void> | void;
};

export function FolderDialog({
	open,
	title,
	description,
	action,
	recent,
	onPick,
	onOpenChange,
}: FolderDialogProps) {
	const [browsing, setBrowsing] = useState<string | undefined>(undefined);
	const [typed, setTyped] = useState("");
	const [showHidden, setShowHidden] = useState(false);
	const [showNew, setShowNew] = useState(false);
	const [newName, setNewName] = useState("");
	const [pending, setPending] = useState<ProjectStatus | undefined>(undefined);
	const [error, setError] = useState<Error | undefined>(undefined);
	const [working, setWorking] = useState(false);
	const trust = useSetProjectTrust();
	const queryClient = useQueryClient();

	/** Each opening starts from a clean draft. Remounting for it would skip the entry transition. */
	const [wasOpen, setWasOpen] = useState(false);
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) {
			setBrowsing(undefined);
			setTyped("");
			setShowHidden(false);
			setShowNew(false);
			setNewName("");
			setPending(undefined);
			setError(undefined);
		}
	}

	const folders = useQuery({
		queryKey: ["config", "projects", "folders", browsing ?? null, showHidden],
		queryFn: ({ signal }) =>
			call(
				(client) =>
					client["settings.projects.folders"](
						browsing === undefined
							? { hidden: showHidden }
							: { hidden: showHidden, path: browsing },
					),
				{ signal },
			),
		enabled: open,
	});
	const chosen = folders.data?.path;

	const create = useMutation({
		mutationFn: ({ parent, name }: { parent: string; name: string }) =>
			call((client) => client["settings.projects.createFolder"]({ name, parent })),
		onSuccess: async (created) => {
			setShowNew(false);
			setNewName("");
			await queryClient.invalidateQueries({ queryKey: ["config", "projects", "folders"] });
			setBrowsing(created.path);
		},
	});

	/** Closing drops the last refusal, so the next opening starts clean. */
	const close = (next: boolean) => {
		if (!next) {
			create.reset();
			trust.reset();
		}
		onOpenChange(next);
	};

	const finish = async (path: string) => {
		try {
			await onPick(path);
			close(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause : new Error(String(cause)));
		}
	};

	/** Write the decision, then finish with the folder the server resolved. */
	const applyTrust = (path: string, decision: ProjectTrustAction) => {
		setWorking(true);
		trust.mutate(
			{ action: decision, path },
			{
				onSuccess: (status) => {
					setWorking(false);
					void finish(status.path);
				},
				onError: () => setWorking(false),
			},
		);
	};

	/** A trusted folder goes straight through; any other asks first. */
	const choose = async (path: string) => {
		setError(undefined);
		setWorking(true);
		try {
			const status = await call((client) => client["settings.projects.status"]({ path }));
			if (status.trusted) await finish(status.path);
			else setPending(status);
		} catch (cause) {
			setError(cause instanceof Error ? cause : new Error(String(cause)));
		} finally {
			setWorking(false);
		}
	};

	/** A typed path is checked by the list route before it becomes the current folder. */
	const goToTyped = async () => {
		const path = typed.trim();
		if (path === "" || working) return;
		setError(undefined);
		setWorking(true);
		try {
			const listing = await call((client) =>
				client["settings.projects.folders"]({ hidden: showHidden, path }),
			);
			setBrowsing(listing.path);
			setTyped("");
		} catch (cause) {
			setError(cause instanceof Error ? cause : new Error(String(cause)));
		} finally {
			setWorking(false);
		}
	};

	if (pending !== undefined) {
		return (
			<DialogFrame
				open={open}
				onOpenChange={close}
				size="lg"
				title={`Trust ${pending.name}?`}
				footer={
					<>
						<Button variant="outline" onClick={() => setPending(undefined)}>
							Back
						</Button>
						{pending.parent !== null && (
							<Button
								variant="outline"
								disabled={trust.isPending || working}
								onClick={() => applyTrust(pending.path, "trust-parent")}
							>
								Trust parent folder
							</Button>
						)}
						<Button
							disabled={trust.isPending || working}
							onClick={() => applyTrust(pending.path, "trust")}
						>
							{(trust.isPending || working) && <Spinner data-icon="inline-start" />}
							Trust and {action.toLowerCase()}
						</Button>
					</>
				}
			>
				<div className="grid gap-field">
					<p className="truncate font-mono text-meta text-muted-foreground">{pending.path}</p>
					<TrustNotice status={pending} />
					{error !== undefined && <Notice error={error} />}
					{trust.error !== null && (
						<Notice error={trust.error} title="The folder was not trusted" />
					)}
				</div>
			</DialogFrame>
		);
	}

	const failure = error ?? create.error ?? undefined;
	return (
		<DialogFrame
			open={open}
			onOpenChange={close}
			size="lg"
			title={title}
			description={description}
			footer={
				<>
					<Button variant="destructive" onClick={() => close(false)}>
						Cancel
					</Button>
					<Button
						disabled={chosen === undefined || working}
						onClick={() => {
							if (chosen !== undefined) void choose(chosen);
						}}
					>
						{working ? (
							<Spinner data-icon="inline-start" />
						) : (
							<FolderOpenIcon data-icon="inline-start" />
						)}
						{action} this folder
					</Button>
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col gap-field">
				<div className="flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5">
					<Tip label="Up one folder">
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Up one folder"
							disabled={folders.data?.parent === null || folders.data === undefined}
							onClick={() => {
								setTyped("");
								setBrowsing(folders.data?.parent ?? undefined);
							}}
						>
							<ArrowUpIcon />
						</Button>
					</Tip>
					<span className="min-w-0 flex-1 truncate font-mono text-meta text-muted-foreground">
						{folders.data?.path ?? "…"}
					</span>
					<label
						htmlFor="show-hidden"
						className="flex items-center gap-2 text-meta text-muted-foreground"
					>
						<Checkbox
							id="show-hidden"
							checked={showHidden}
							onCheckedChange={(checked) => setShowHidden(checked)}
						/>
						Show hidden
					</label>
					<Button
						variant="outline"
						size="xs"
						onClick={() => {
							create.reset();
							setError(undefined);
							setNewName("");
							setShowNew(true);
						}}
					>
						<FolderPlusIcon data-icon="inline-start" />
						New folder
					</Button>
				</div>

				{showNew && (
					<form
						className="flex gap-2"
						onSubmit={(event) => {
							event.preventDefault();
							const name = newName.trim();
							if (name === "" || folders.data === undefined) return;
							setError(undefined);
							create.mutate({ parent: folders.data.path, name });
						}}
					>
						<Input
							aria-label="New folder name"
							value={newName}
							autoComplete="off"
							maxLength={255}
							placeholder="Folder name"
							className="min-w-0"
							onChange={(event) => setNewName(event.target.value)}
						/>
						<Button
							type="submit"
							variant="outline"
							disabled={newName.trim() === "" || folders.data === undefined || create.isPending}
						>
							{create.isPending && <Spinner data-icon="inline-start" />}
							Create
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={() => {
								setShowNew(false);
								setNewName("");
								create.reset();
							}}
						>
							Cancel
						</Button>
					</form>
				)}

				<div className="min-h-0 flex-1 overflow-y-auto rounded-lg border p-1">
					{folders.isPending ? (
						<LoadingState label="Loading folders…" />
					) : folders.isError ? (
						<StatusView error={folders.error} />
					) : (
						<div className="grid content-start gap-row">
							{recent.length > 0 && (
								<>
									<p className="px-2 py-1 text-meta font-medium text-muted-foreground">
										Recent projects
									</p>
									{recent.map((project) => (
										<button
											key={project.path}
											type="button"
											disabled={working}
											className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-body hover:bg-muted"
											onClick={() => void choose(project.path)}
										>
											<FolderIcon className="size-4 shrink-0 text-muted-foreground" />
											<span className="truncate">{project.name}</span>
											<span className="ml-auto truncate font-mono text-meta text-muted-foreground">
												{project.path}
											</span>
										</button>
									))}
									<p className="px-2 py-1 text-meta font-medium text-muted-foreground">Folders</p>
								</>
							)}
							{folders.data.folders.length === 0 ? (
								<div className="px-2 py-1">
									<InlineStatus icon={InboxIcon}>No subfolders here</InlineStatus>
								</div>
							) : (
								folders.data.folders.map((folder) => (
									<button
										key={folder.path}
										type="button"
										className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-body hover:bg-muted"
										onClick={() => {
											setTyped("");
											setBrowsing(folder.path);
										}}
									>
										<FolderIcon className="size-4 shrink-0 text-muted-foreground" />
										<span className="truncate">{folder.name}</span>
									</button>
								))
							)}
							{folders.data.truncated && (
								<p className="px-2 py-1 text-meta text-muted-foreground">
									More folders exist than shown; type the path.
								</p>
							)}
						</div>
					)}
				</div>

				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="project-path">Or type a path</FieldLabel>
						<form
							className="flex gap-2"
							onSubmit={(event) => {
								event.preventDefault();
								if (!working) void goToTyped();
							}}
						>
							<Input
								id="project-path"
								placeholder="~/code/my-project"
								value={typed}
								className="min-w-0"
								onChange={(event) => setTyped(event.target.value)}
							/>
							<Button type="submit" variant="outline" disabled={typed.trim() === "" || working}>
								{working && <Spinner data-icon="inline-start" />}
								Go
							</Button>
						</form>
						<FieldDescription>The folder must exist.</FieldDescription>
					</Field>
				</FieldGroup>

				{failure !== undefined && <Notice error={failure} />}
			</div>
		</DialogFrame>
	);
}
