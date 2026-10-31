/**
 * Pick a folder for a project, then trust it before anything happens there. A
 * browser cannot hand the server an absolute path, so the server lists folders
 * (names only) and a path can also be typed. The picker can show dot folders and
 * create one folder at a time. Opening a project and moving a chat into one both
 * go through here, so trust is always asked the same way.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon, InboxIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tip } from "@/components/patterns/tip";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { DialogFrame } from "@/components/patterns/dialog/dialog-frame";
import { errorView } from "@/components/patterns/status/error-view";
import { InlineStatus } from "@/components/patterns/status/inline-status";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { projectKeys } from "@/api/keys";
import { createFolder, fetchFolders, fetchProjectStatus } from "@/api/endpoints";
import { useTrustProject } from "@/features/projects/queries";
import { TrustNotice } from "@/features/projects/trust-notice";
import type { ProjectStatus } from "@/api/types";

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

export function FolderDialog(props: FolderDialogProps) {
	// Each opening starts with a clean draft: the picker is remounted when it opens.
	const [opening, setOpening] = useState(0);
	const [wasOpen, setWasOpen] = useState(false);
	if (props.open !== wasOpen) {
		setWasOpen(props.open);
		if (props.open) setOpening((count) => count + 1);
	}
	return <FolderPicker key={opening} {...props} />;
}

function FolderPicker({
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
	const [error, setError] = useState<string | undefined>(undefined);
	const [working, setWorking] = useState(false);
	const trust = useTrustProject();
	const queryClient = useQueryClient();

	const folders = useQuery({
		queryKey: projectKeys.folders(browsing, showHidden),
		queryFn: () => fetchFolders(browsing, showHidden),
		enabled: open,
	});
	const chosen = folders.data?.path;

	const create = useMutation({
		mutationFn: ({ parent, name }: { parent: string; name: string }) => createFolder(parent, name),
		onSuccess: async (path, { parent }) => {
			setShowNew(false);
			setNewName("");
			await queryClient.invalidateQueries({ queryKey: projectKeys.folders(parent, showHidden) });
			setBrowsing(path);
		},
	});

	const finish = async (path: string) => {
		try {
			await onPick(path);
			onOpenChange(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	};

	/** A trusted folder goes straight through; any other asks first. */
	const choose = async (path: string) => {
		setError(undefined);
		setWorking(true);
		try {
			const status = await fetchProjectStatus(path);
			if (status.trusted) await finish(status.path);
			else setPending(status);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
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
			const listing = await fetchFolders(path, showHidden);
			setBrowsing(listing.path);
			setTyped("");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setWorking(false);
		}
	};

	if (pending !== undefined) {
		return (
			<DialogFrame
				open={open}
				onOpenChange={onOpenChange}
				size="lg"
				title={`Trust ${pending.name}?`}
				footer={
					<>
						<Button variant="outline" onClick={() => setPending(undefined)}>
							Back
						</Button>
						<Button
							disabled={trust.isPending || working}
							onClick={() => {
								setWorking(true);
								trust.mutate(pending.path, {
									onSuccess: async (status) => {
										await finish(status.path);
										setWorking(false);
									},
									onError: () => setWorking(false),
								});
							}}
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
					{(error !== undefined || trust.isError) && (
						<Notice tone="error">{error ?? trust.error?.message}</Notice>
					)}
				</div>
			</DialogFrame>
		);
	}

	const failure = error ?? create.error?.message;
	return (
		<DialogFrame
			open={open}
			onOpenChange={onOpenChange}
			size="lg"
			title={title}
			description={description}
			footer={
				<>
					<Button variant="destructive" onClick={() => onOpenChange(false)}>
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
							onCheckedChange={(checked) => setShowHidden(checked === true)}
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
							autoFocus
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
						<StatusView {...errorView(folders.error)} />
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

				{failure !== undefined && <Notice tone="error">{failure}</Notice>}
			</div>
		</DialogFrame>
	);
}
