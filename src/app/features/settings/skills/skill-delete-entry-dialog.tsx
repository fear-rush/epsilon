/**
 * Delete one file, or one folder that holds nothing, from the Raw view's tree. The
 * list refreshes once it is gone; the page picks SKILL.md again when the open file
 * was the one deleted. The dialog stays mounted so its closing transition can play.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { SkillRoot } from "#protocol/settings/skills";
import type { FileTreeTarget } from "@/components/ai-elements/file-tree";
import { DeleteDialog } from "@/components/patterns/confirm-dialogs";
import { useLastDefined } from "@/hooks/use-last-defined";

import { settingsKeys } from "../keys.ts";
import { useSettingsProject } from "../queries.ts";
import { removeSkillFile, removeSkillFolder } from "./api.ts";

export function SkillDeleteEntryDialog({
	entry,
	root,
	name,
	onDeleted,
	onClose,
}: {
	/** The row whose trash was clicked; undefined while the dialog is closed. */
	entry: FileTreeTarget | undefined;
	root: SkillRoot;
	name: string;
	onDeleted: (entry: FileTreeTarget) => void;
	onClose: () => void;
}) {
	const project = useSettingsProject();
	const queryClient = useQueryClient();
	const shown = useLastDefined(entry);
	const remove = useMutation({
		mutationFn: (target: FileTreeTarget) =>
			target.folder
				? removeSkillFolder(project, root, name, target.path)
				: removeSkillFile(project, root, name, target.path),
		onSuccess: (_, target) => {
			void queryClient.invalidateQueries({
				queryKey: settingsKeys.skillFiles(project, root, name),
			});
			onDeleted(target);
		},
	});

	return (
		<DeleteDialog
			open={entry !== undefined}
			title={`Delete ${shown?.path ?? "this entry"}?`}
			description={
				shown?.folder === true
					? "The empty folder is deleted."
					: "The file is removed from the skill folder."
			}
			error={remove.error}
			pending={remove.isPending}
			confirmLabel="Delete"
			onOpenChange={(next) => {
				if (next) return;
				remove.reset();
				onClose();
			}}
			onConfirm={() => {
				if (entry !== undefined) remove.mutate(entry);
			}}
		/>
	);
}
