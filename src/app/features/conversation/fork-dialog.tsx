/**
 * Fork from a message: every user message in this chat, in tree order. Picking one copies
 * the history up to just before it into a new session and the page moves there with the
 * message's text in the box; the chat this dialog belongs to keeps its id and its file.
 *
 * The branch's fork is an engine command, and the engine hands the selected text back for
 * the new file, so this dialog carries no pending draft across the route change.
 */
import { CornerUpLeftIcon } from "lucide-react";
import { useEffect, useState } from "react";

import type { TreeEntry } from "#protocol/conversation/frames";
import { DialogFrame } from "@/components/patterns/dialog-frame";
import { errorView } from "@/components/patterns/status/error-view";
import { InlineStatus } from "@/components/patterns/status/inline-status";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";

import type { Conversation } from "./use-conversation.ts";

/** The messages of the tree a fork may start from: user entries, in the order pi keeps. */
const userMessagesOf = (tree: ReadonlyArray<TreeEntry>): ReadonlyArray<TreeEntry> =>
	tree.filter((entry) => entry.kind === "user");

export function ForkSessionDialog({
	open,
	onOpenChange,
	conversation,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	conversation: Conversation;
}) {
	const loadTree = conversation.loadTree;
	const [pending, setPending] = useState(false);
	const [problem, setProblem] = useState<string | undefined>(undefined);
	const [loaded, setLoaded] = useState(false);

	// The tree is read when the dialog opens, the same read the branch picker makes.
	useEffect(() => {
		let cancelled = false;
		const load = async (): Promise<void> => {
			try {
				await loadTree();
				if (!cancelled) setLoaded(true);
			} catch (cause) {
				if (!cancelled) {
					setProblem(errorView(cause instanceof Error ? cause : new Error(String(cause))).line);
				}
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, [loadTree]);

	const forkFrom = async (entry: TreeEntry): Promise<void> => {
		setPending(true);
		setProblem(undefined);
		try {
			await conversation.fork(entry.id, "before");
			onOpenChange(false);
		} catch (cause) {
			setProblem(errorView(cause instanceof Error ? cause : new Error(String(cause))).line);
		} finally {
			setPending(false);
		}
	};

	const messages = userMessagesOf(conversation.state.tree);

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
				loaded ? (
					<InlineStatus icon={CornerUpLeftIcon}>
						This chat has no message to fork from yet.
					</InlineStatus>
				) : (
					<LoadingState label="Reading the messages…" />
				)
			) : (
				<div className="flex flex-col">
					{messages.map((message, index) => (
						<button
							key={message.id}
							type="button"
							disabled={pending}
							className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-body hover:bg-muted disabled:opacity-50"
							onClick={() => void forkFrom(message)}
						>
							<span className="w-6 shrink-0 text-right text-meta text-muted-foreground tabular-nums">
								{index + 1}
							</span>
							<span className="min-w-0 flex-1 truncate">{message.label || "No text"}</span>
						</button>
					))}
				</div>
			)}
			{problem !== undefined && (
				<div className="pt-field">
					<Notice tone="danger">{problem}</Notice>
				</div>
			)}
		</DialogFrame>
	);
}
