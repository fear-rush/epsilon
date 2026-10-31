/**
 * Fork from a message: the active branch's user messages, root to leaf, listed the
 * way the composer's "Go back" menu lists them. Picking one copies the chat up to
 * that message into a new session and the page moves there; the chat this dialog
 * belongs to keeps its id and its file (docs/DECISIONS.md, Session copies).
 */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CornerUpLeftIcon } from "lucide-react";
import { useState } from "react";
import type { SnapshotBranch } from "shared";

import { forkSession } from "@/api/endpoints";
import { sessionKeys } from "@/api/keys";
import { DialogFrame } from "@/components/patterns/dialog/dialog-frame";
import { InlineStatus } from "@/components/patterns/status/inline-status";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { BranchRow } from "./branch-row";

export function ForkSessionDialog({
	open,
	onOpenChange,
	sessionId,
	project,
	branches,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sessionId: string;
	/** The project the chat runs in, so the new session opens in the same place. */
	project: string | undefined;
	/** The active branch's user messages, root to leaf. */
	branches: SnapshotBranch[];
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [pending, setPending] = useState(false);
	const [problem, setProblem] = useState<string | undefined>(undefined);
	const [wasOpen, setWasOpen] = useState(false);

	// A new opening starts clean: the refusal belongs to the message that was picked.
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) setProblem(undefined);
	}

	const forkFrom = async (branch: SnapshotBranch): Promise<void> => {
		setPending(true);
		setProblem(undefined);
		try {
			const id = await forkSession(sessionId, branch.entryId);
			await queryClient.invalidateQueries({ queryKey: sessionKeys.all });
			onOpenChange(false);
			await navigate({
				to: "/sessions/$sessionId",
				params: { sessionId: id },
				search: { project },
			});
		} catch (cause) {
			setProblem(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setPending(false);
		}
	};

	return (
		<DialogFrame
			open={open}
			onOpenChange={onOpenChange}
			size="md"
			title="Fork from a message"
			description="The new chat holds this branch up to the message you pick, and this one stays as it is."
			footer={
				<Button type="button" variant="destructive" onClick={() => onOpenChange(false)}>
					Cancel
				</Button>
			}
		>
			{branches.length === 0 ? (
				<InlineStatus icon={CornerUpLeftIcon}>
					This chat has no message to fork from yet.
				</InlineStatus>
			) : (
				<div className="flex flex-col">
					{branches.map((branch, index) => (
						<button
							key={branch.entryId}
							type="button"
							disabled={pending}
							className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-body hover:bg-muted disabled:opacity-50"
							onClick={() => void forkFrom(branch)}
						>
							<BranchRow branch={branch} index={index} />
						</button>
					))}
				</div>
			)}
			{problem !== undefined && (
				<div className="pt-field">
					<Notice tone="error">{problem}</Notice>
				</div>
			)}
		</DialogFrame>
	);
}
