import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { deleteSkillBundleFile } from "@/api/endpoints";
import { settingsKeys } from "@/api/keys";
import type { SkillRoot } from "@/api/types";
import { CancelDialog, DeleteDialog } from "@/components/patterns/dialog/confirm-dialogs";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { StatusView } from "@/components/patterns/status/status-view";
import { useLastDefined } from "@/hooks/use-last-defined";
import { useSettingsProject, useSkillFiles } from "@/features/settings/queries";
import { SkillFileDialog } from "./skill-file-dialog";
import type { BundleEntry } from "./skill-file-tree";
import { SkillFilesList } from "./skill-files-list";

/**
 * The files bundled next to SKILL.md, as the Files card. A text file opens in a
 * dialog with its own Save and Discard, and the Raw view adds and removes files.
 * Nothing here touches the form draft: each file is written on its own.
 */
export function SkillFiles({
	root,
	name,
	onDirtyChange,
}: {
	root: SkillRoot;
	name: string;
	onDirtyChange: (dirty: boolean) => void;
}) {
	const project = useSettingsProject();
	const queryClient = useQueryClient();
	const list = useSkillFiles(root, name);
	const [open, setOpen] = useState<string | undefined>();
	const shownOpen = useLastDefined(open);
	const [dirty, setDirty] = useState(false);
	// A switch that waits for the answer to "discard changes?".
	const [pending, setPending] = useState<(() => void) | undefined>();
	const [removing, setRemoving] = useState<BundleEntry | undefined>();
	const shownRemoving = useLastDefined(removing);

	const changeDirty = (value: boolean) => {
		setDirty(value);
		onDirtyChange(value);
	};
	const guarded = (action: () => void) => {
		if (dirty) setPending(() => action);
		else action();
	};
	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: settingsKeys.skillFiles(project, root, name) });
	};
	const forget = (path: string) => {
		queryClient.removeQueries({ queryKey: settingsKeys.skillFile(project, root, name, path) });
	};

	const remove = useMutation({
		mutationFn: (path: string) => deleteSkillBundleFile(project, root, name, path),
		onSuccess: (_, path) => {
			forget(path);
			if (open === path) {
				setOpen(undefined);
				changeDirty(false);
			}
			setRemoving(undefined);
			refresh();
		},
	});

	if (list.isPending) {
		return <LoadingState label="Reading files…" />;
	}
	if (list.error !== null) return <StatusView {...errorView(list.error)} />;

	const files = list.data.files;
	// SKILL.md is the Instructions card.
	const listed = files
		.filter((file) => file.path !== "SKILL.md")
		.sort((a, b) => a.path.localeCompare(b.path));

	return (
		<div className="grid gap-field">
			{listed.length > 0 && (
				<SkillFilesList
					files={listed}
					onOpen={(path) => guarded(() => setOpen(path))}
					onDelete={(file) => {
						remove.reset();
						setRemoving(file);
					}}
				/>
			)}
			{list.data.skipped > 0 && (
				<p className="text-meta text-muted-foreground">
					{list.data.skipped} hidden (symlinks or past the cap)
				</p>
			)}

			<SkillFileDialog
				open={open !== undefined}
				root={root}
				name={name}
				path={shownOpen}
				onDirtyChange={changeDirty}
				onSaved={refresh}
				onClose={() => guarded(() => setOpen(undefined))}
			/>

			<CancelDialog
				open={pending !== undefined}
				title="Discard unsaved changes?"
				description={`${open === undefined ? "This file" : open} has changes that are not saved. Switching now loses them.`}
				onOpenChange={(next) => {
					if (!next) setPending(undefined);
				}}
				onDiscard={() => {
					changeDirty(false);
					pending?.();
					setPending(undefined);
				}}
			/>
			<DeleteDialog
				open={removing !== undefined}
				title={`Delete ${shownRemoving?.path ?? "file"}?`}
				description="The file is removed from the skill folder."
				error={remove.error}
				pending={remove.isPending}
				confirmLabel="Delete"
				onOpenChange={(next) => {
					if (!next) setRemoving(undefined);
				}}
				onConfirm={() => {
					if (removing !== undefined) remove.mutate(removing.path);
				}}
			/>
		</div>
	);
}
