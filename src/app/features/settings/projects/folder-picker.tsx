import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronUpIcon, FolderIcon } from "lucide-react";
import { useState } from "react";

import type { FolderListing } from "#protocol/settings/projects";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { call } from "@/core/runtime";

/**
 * One level of folders at a time.
 *
 * The server lists folders and never files, and it bounds the walk: a dev sandbox opens
 * only its own home, a host opens the disk. Creating a folder descends into it, so the
 * next press can use it.
 */
export function FolderPicker({
	open,
	onClose,
	onPick,
}: {
	open: boolean;
	onClose: () => void;
	onPick: (path: string) => void;
}) {
	if (!open) return null;
	return <PickerDialog onClose={onClose} onPick={onPick} />;
}

function PickerDialog({
	onClose,
	onPick,
}: {
	onClose: () => void;
	onPick: (path: string) => void;
}) {
	const queryClient = useQueryClient();
	/** Undefined asks the server for its starting folder: the sandbox root or the home. */
	const [path, setPath] = useState<string | undefined>(undefined);
	const [hidden, setHidden] = useState(false);
	const [name, setName] = useState("");

	const listing = useQuery({
		queryKey: ["config", "projects", "folders", path ?? null, hidden],
		queryFn: ({ signal }) =>
			call(
				(client) =>
					client["settings.projects.folders"](path === undefined ? { hidden } : { hidden, path }),
				{ signal },
			),
	});
	const create = useMutation({
		mutationFn: (input: { parent: string; name: string }) =>
			call((client) => client["settings.projects.createFolder"](input)),
		onSuccess: (created) => {
			setName("");
			void queryClient.invalidateQueries({ queryKey: ["config", "projects", "folders"] });
			setPath(created.path);
		},
	});

	const current = listing.data;

	return (
		<Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Open a folder</DialogTitle>
					<DialogDescription>
						Start a chat in a folder. pi&apos;s trust decision is asked before anything runs there.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3">
					<div className="flex items-center gap-2">
						<Button
							aria-label="Go to the parent folder"
							disabled={current === undefined || current.parent === null || listing.isFetching}
							size="icon-sm"
							variant="outline"
							onClick={() => setPath(current?.parent ?? undefined)}
						>
							<ChevronUpIcon />
						</Button>
						<p className="min-w-0 flex-1 truncate text-meta text-muted-foreground">
							{current?.path ?? "…"}
						</p>
					</div>
					<FolderList current={current} error={listing.error} onDescend={setPath} />
					<form
						className="flex gap-2"
						onSubmit={(event) => {
							event.preventDefault();
							if (current !== undefined && name.trim() !== "") {
								create.mutate({ name: name.trim(), parent: current.path });
							}
						}}
					>
						<Input
							aria-label="New folder name"
							autoComplete="off"
							placeholder="New folder name"
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
						<Button
							type="submit"
							variant="outline"
							disabled={current === undefined || name.trim() === "" || create.isPending}
						>
							Create
						</Button>
					</form>
					{create.error !== null && (
						<Notice tone="danger" title="The folder was not created">
							{errorView(create.error).line}
						</Notice>
					)}
					<div className="flex items-center gap-2 text-meta text-muted-foreground">
						<Switch aria-label="Show hidden folders" checked={hidden} onCheckedChange={setHidden} />
						Show hidden folders
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						disabled={current === undefined}
						onClick={() => {
							if (current !== undefined) onPick(current.path);
						}}
					>
						Use this folder
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function FolderList({
	current,
	error,
	onDescend,
}: {
	current: FolderListing | undefined;
	error: Error | null;
	onDescend: (path: string) => void;
}) {
	if (error !== null) {
		return (
			<Notice tone="danger" title="This folder cannot be read">
				{errorView(error).line}
			</Notice>
		);
	}
	if (current === undefined) return <LoadingState label="Reading folders…" />;
	return (
		<div className="grid max-h-64 gap-0.5 overflow-y-auto rounded-xl border p-1">
			{current.folders.length === 0 && (
				<p className="p-2 text-meta text-muted-foreground">No folders here.</p>
			)}
			{current.folders.map((folder) => (
				<Button
					key={folder.path}
					className="justify-start gap-2"
					size="sm"
					variant="ghost"
					onClick={() => onDescend(folder.path)}
				>
					<FolderIcon className="text-muted-foreground" />
					<span className="truncate">{folder.name}</span>
				</Button>
			))}
			{current.truncated && (
				<p className="p-2 text-meta text-muted-foreground">
					More folders exist than this list carries.
				</p>
			)}
		</div>
	);
}
