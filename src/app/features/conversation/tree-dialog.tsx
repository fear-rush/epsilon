import { GitForkIcon } from "lucide-react";
import { useEffect, useState } from "react";

import type { TreeEntry } from "#protocol/conversation/frames";
import { errorView } from "@/components/patterns/status/error-view";
import { LoadingState } from "@/components/patterns/status/loading-state";
import { Notice } from "@/components/patterns/status/notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

import type { Conversation } from "./use-conversation.ts";

/**
 * The branch tree, read when the dialog opens.
 *
 * A tree is a chat's history of choices, not a transcript: a row is one entry, indented by
 * its depth, and the root-to-leaf path is marked. Picking a user message moves the leaf to
 * that message's parent and hands its text back to the composer; any other entry becomes
 * the leaf itself. Epsilon stores nothing: pi's file is the tree.
 */
export function TreeDialog({
	conversation,
	onClose,
}: {
	conversation: Conversation;
	onClose: () => void;
}) {
	const loadTree = conversation.loadTree;
	const [failure, setFailure] = useState<Error | undefined>(undefined);
	const [picking, setPicking] = useState<string | undefined>(undefined);

	useEffect(() => {
		loadTree().catch((cause: unknown) =>
			setFailure(cause instanceof Error ? cause : new Error(String(cause))),
		);
	}, [loadTree]);

	// The tree starts empty in state; the frame replaces the array, which is the signal
	// that the answer arrived. This is the tree as it was when the dialog opened.
	const [initialTree] = useState(conversation.state.tree);
	const tree = conversation.state.tree;
	const rows = tree === initialTree ? undefined : order(tree);

	const pick = async (entry: TreeEntry): Promise<void> => {
		setPicking(entry.id);
		try {
			await conversation.navigateTree(entry.id);
			onClose();
		} catch (cause) {
			setPicking(undefined);
			setFailure(cause instanceof Error ? cause : new Error(String(cause)));
		}
	};

	/** A fork is a new session file; the engine re-keys and the page follows the new id. */
	const fork = async (entry: TreeEntry): Promise<void> => {
		setPicking(entry.id);
		try {
			await conversation.fork(entry.id, "before");
			onClose();
		} catch (cause) {
			setPicking(undefined);
			setFailure(cause instanceof Error ? cause : new Error(String(cause)));
		}
	};

	return (
		<Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Branch tree</DialogTitle>
					<DialogDescription>
						Picking a user message goes back to just before it and puts its text in the composer.
						Any other entry becomes the branch tip.
					</DialogDescription>
				</DialogHeader>
				{rows === undefined ? (
					<LoadingState label="Reading the tree…" />
				) : (
					<div className="grid max-h-96 gap-0.5 overflow-y-auto rounded-xl border p-1">
						{rows.length === 0 && (
							<p className="p-2 text-meta text-muted-foreground">This chat has no entries yet.</p>
						)}
						{rows.map(({ depth, entry }) => (
							<div key={entry.id} className="flex items-center gap-1">
								<Button
									className="min-w-0 flex-1 justify-start gap-2"
									disabled={picking !== undefined}
									size="sm"
									variant={entry.onPath ? "secondary" : "ghost"}
									onClick={() => void pick(entry)}
								>
									<span className="truncate" style={{ paddingInlineStart: `${depth * 0.75}rem` }}>
										{entry.label}
									</span>
									<Badge
										className="ml-auto shrink-0"
										variant={entry.onPath ? "default" : "outline"}
									>
										{entry.kind}
									</Badge>
								</Button>
								{entry.kind === "user" && (
									<Button
										aria-label={`Fork from ${entry.label}`}
										disabled={picking !== undefined}
										size="icon-sm"
										variant="ghost"
										onClick={() => void fork(entry)}
									>
										<GitForkIcon />
									</Button>
								)}
							</div>
						))}
					</div>
				)}
				{failure !== undefined && (
					<Notice tone="error" title="The branch was not moved">
						{errorView(failure).line}
					</Notice>
				)}
			</DialogContent>
		</Dialog>
	);
}

type Row = { readonly depth: number; readonly entry: TreeEntry };

/** Depth-first from the roots, iteratively: a 50,000-entry tree must not recurse. */
function order(tree: ReadonlyArray<TreeEntry>): ReadonlyArray<Row> {
	const children = new Map<string, Array<TreeEntry>>();
	const roots: Array<TreeEntry> = [];
	for (const entry of tree) {
		if (entry.parentId === null) {
			roots.push(entry);
			continue;
		}
		const siblings = children.get(entry.parentId);
		if (siblings === undefined) children.set(entry.parentId, [entry]);
		else siblings.push(entry);
	}
	const rows: Array<Row> = [];
	const stack: Array<Row> = roots.toReversed().map((entry) => ({ depth: 0, entry }));
	while (stack.length > 0) {
		const row = stack.pop();
		if (row === undefined) break;
		rows.push(row);
		const kids = children.get(row.entry.id) ?? [];
		for (let index = kids.length - 1; index >= 0; index -= 1) {
			const kid = kids[index];
			if (kid !== undefined) stack.push({ depth: row.depth + 1, entry: kid });
		}
	}
	return rows;
}
