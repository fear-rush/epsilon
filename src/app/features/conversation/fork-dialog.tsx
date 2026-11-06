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

import type { SnapshotTreeNode } from "#domain/conversation/tree";
import { DialogFrame } from "@/components/patterns/dialog-frame";
import { errorText } from "@/components/patterns/status/error-view";
import { InlineStatus } from "@/components/patterns/status/inline-status";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";

import type { Conversation } from "./use-conversation.ts";

/** The first line of a message, so every row in the list stays one line tall. */
const firstLine = (text: string): string => text.trimStart().split("\n")[0] ?? "";

/** The user messages of the whole tree, in tree order: what pi's fork picker offers. */
const userMessagesOf = (
	nodes: ReadonlyArray<SnapshotTreeNode>,
): ReadonlyArray<{ entryId: string; text: string }> => {
	const messages: { entryId: string; text: string }[] = [];
	const walk = (list: ReadonlyArray<SnapshotTreeNode>): void => {
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

	// The tree is read when the dialog opens, the same read the branch picker makes. The
	// dialog stays mounted while closed, so the read is gated on `open`, not on mounting.
	useEffect(() => {
		let cancelled = false;
		const load = async (): Promise<void> => {
			try {
				await loadTree();
				if (cancelled) return;
				setProblem(undefined);
				setLoaded(true);
			} catch (cause) {
				if (cancelled) return;
				setProblem(errorText(cause instanceof Error ? cause : new Error(String(cause))));
			}
		};
		if (open) void load();
		return () => {
			cancelled = true;
		};
	}, [open, loadTree]);

	const forkFrom = async (message: { entryId: string; text: string }): Promise<void> => {
		setPending(true);
		setProblem(undefined);
		try {
			await conversation.fork(message.entryId, "before");
			onOpenChange(false);
		} catch (cause) {
			setProblem(errorText(cause instanceof Error ? cause : new Error(String(cause))));
		} finally {
			setPending(false);
		}
	};

	const messages = userMessagesOf(conversation.state.tree);

	/** A close forgets the last read, so the next opening waits for its own. */
	const change = (next: boolean): void => {
		if (!next) setLoaded(false);
		onOpenChange(next);
	};

	return (
		<DialogFrame
			open={open}
			onOpenChange={change}
			size="md"
			title="Fork from a message"
			description="Starts a new chat from just before the message you pick. This chat stays as it is."
			footer={
				<Button type="button" variant="outline" onClick={() => change(false)}>
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
							key={message.entryId}
							type="button"
							disabled={pending}
							className="flex min-w-0 items-center gap-2 rounded-chip px-2 py-1.5 text-left text-body hover:bg-muted disabled:opacity-50"
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
					<Notice tone="danger">{problem}</Notice>
				</div>
			)}
		</DialogFrame>
	);
}
