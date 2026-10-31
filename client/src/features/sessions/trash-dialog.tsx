/**
 * Recently deleted: the chats Epsilon moved to its own trash, each with the record
 * of where it came from. A restore puts a chat back in pi's list; a purge is the
 * one step that destroys the file, so it confirms first. The list is read when the
 * dialog opens, because nothing polls a trash.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TrashIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DialogFrame } from "@/components/patterns/dialog/dialog-frame";
import { DeleteDialog } from "@/components/patterns/dialog/confirm-dialogs";
import { ListItem } from "@/components/patterns/list/list-item";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { StatusView } from "@/components/patterns/status/status-view";
import { Tip } from "@/components/patterns/tip";
import { fetchTrash, purgeTrashedSession, restoreTrashedSession } from "@/api/endpoints";
import { sessionKeys } from "@/api/keys";
import { formatWhen, sessionLabel } from "@/features/sessions/format";
import type { TrashedSession } from "@/api/types";

export function TrashDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const [purging, setPurging] = useState<TrashedSession | undefined>(undefined);
	const trash = useQuery({
		queryKey: sessionKeys.trash,
		queryFn: ({ signal }) => fetchTrash(signal),
		enabled: open,
	});
	// `sessionKeys.trash` sits under `sessionKeys.all`, so one invalidation refreshes
	// the sidebar and this list together.
	const refresh = async () => {
		await queryClient.invalidateQueries({ queryKey: sessionKeys.all });
	};
	const restore = useMutation({
		mutationFn: restoreTrashedSession,
		onSuccess: refresh,
	});
	const purge = useMutation({
		mutationFn: purgeTrashedSession,
		onSuccess: async () => {
			setPurging(undefined);
			await refresh();
		},
	});
	const failure = restore.error;
	const entries = trash.data?.entries ?? [];

	return (
		<>
			<DialogFrame
				open={open}
				onOpenChange={onOpenChange}
				size="md"
				title="Recently deleted"
				description="A deleted chat waits here until you restore it or delete it for good."
			>
				<div className="grid gap-row">
					{failure !== null && <Notice tone="error">{failure.message}</Notice>}
					{trash.data?.problem !== undefined && <Notice tone="error">{trash.data.problem}</Notice>}
					{trash.isPending ? (
						<LoadingState label="Reading the trash…" />
					) : trash.isError ? (
						<StatusView {...errorView(trash.error)} />
					) : entries.length === 0 ? (
						<StatusView
							icon={TrashIcon}
							title="Nothing in the trash"
							line="Chats you delete appear here."
						/>
					) : (
						entries.map((entry) => (
							<ListItem
								key={entry.id}
								name={sessionLabel(entry)}
								description={`Deleted ${formatWhen(entry.deletedAt)}`}
								trailing={
									<span className="flex shrink-0 items-center gap-1">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											disabled={restore.isPending}
											onClick={() => restore.mutate(entry.id)}
										>
											<Undo2Icon data-icon="inline-start" />
											Restore
										</Button>
										<Tip label="Delete permanently">
											<Button
												type="button"
												variant="destructive"
												size="icon-sm"
												aria-label={`Delete ${sessionLabel(entry)} permanently`}
												disabled={purge.isPending}
												onClick={() => {
													purge.reset();
													setPurging(entry);
												}}
											>
												<Trash2Icon />
											</Button>
										</Tip>
									</span>
								}
							/>
						))
					)}
				</div>
			</DialogFrame>

			<DeleteDialog
				open={purging !== undefined}
				title="Delete this chat for good?"
				description={
					purging === undefined
						? ""
						: `${sessionLabel(purging)} is removed from Epsilon's trash. This cannot be undone.`
				}
				error={purge.error}
				pending={purge.isPending}
				confirmLabel="Delete permanently"
				onOpenChange={(next) => {
					if (!next) {
						purge.reset();
						setPurging(undefined);
					}
				}}
				onConfirm={() => {
					if (purging !== undefined) purge.mutate(purging.id);
				}}
			/>
		</>
	);
}
