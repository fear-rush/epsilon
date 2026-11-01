/**
 * Fork from a message: every user message in this chat's tree, in tree order.
 * Picking one copies the history up to just before it into a new session and the
 * page moves there with the message's text in the box; the chat this dialog
 * belongs to keeps its id and its file (docs/DECISIONS.md, Session copies).
 */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CornerUpLeftIcon } from "lucide-react";
import { useState } from "react";
import type { SnapshotTreeNode } from "shared";

import { forkSession } from "@/api/endpoints";
import { sessionKeys } from "@/api/keys";
import { DialogFrame } from "@/components/patterns/dialog/dialog-frame";
import { InlineStatus } from "@/components/patterns/status/inline-status";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { setPendingDraft } from "./pending-draft";

/** The first line of a message, so every row in the list stays one line tall. */
const firstLine = (text: string): string => text.trimStart().split("\n")[0] ?? "";

/** The user messages of the whole tree, in tree order: what pi's fork picker offers. */
const userMessagesOf = (nodes: SnapshotTreeNode[]): { entryId: string; text: string }[] => {
	const messages: { entryId: string; text: string }[] = [];
	const walk = (list: SnapshotTreeNode[]): void => {
		for (const node of list) {
			if (node.kind === "user") messages.push({ entryId: node.entryId, text: node.text });
			walk(node.children);
		}
	};
	walk(nodes);
	return messages;
};

export function ForkSessionDialog({
	open,
	onOpenChange,
	sessionId,
	project,
	tree,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sessionId: string;
	/** The project the chat runs in, so the new session opens in the same place. */
	project: string | undefined;
	/** The session tree, read for its user messages. */
	tree: SnapshotTreeNode[];
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [pending, setPending] = useState(false);
	const [problem, setProblem] = useState<string | undefined>(undefined);
	const [wasOpen, setWasOpen] = useState(false);
	const messages = userMessagesOf(tree);

	// A new opening starts clean: the refusal belongs to the message that was picked.
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) setProblem(undefined);
	}

	const forkFrom = async (message: { entryId: string; text: string }): Promise<void> => {
		setPending(true);
		setProblem(undefined);
		try {
			const id = await forkSession(sessionId, message.entryId);
			setPendingDraft(id, message.text);
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
			description="The new chat holds this chat up to just before the message you pick, and that message's text waits in the box. This chat stays as it is."
			footer={
				<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
					Cancel
				</Button>
			}
		>
			{messages.length === 0 ? (
				<InlineStatus icon={CornerUpLeftIcon}>
					This chat has no message to fork from yet.
				</InlineStatus>
			) : (
				<div className="flex flex-col">
					{messages.map((message, index) => (
						<button
							key={message.entryId}
							type="button"
							disabled={pending}
							className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-body hover:bg-muted disabled:opacity-50"
							onClick={() => void forkFrom(message)}
						>
							<span className="w-6 shrink-0 text-right text-meta text-muted-foreground tabular-nums">
								{index + 1}
							</span>
							<span className="min-w-0 flex-1 truncate">
								{firstLine(message.text) || "No text"}
							</span>
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
