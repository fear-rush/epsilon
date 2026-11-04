/**
 * pi's three ways to branch, owned by the page because the composer and the session
 * controls both reach them. The composer answers `/tree`, `/fork` and `/clone` with
 * this, and the session controls' Branch group calls the same actions. The dialogs are
 * rendered once by the page, so the composer stays only the owner of its draft.
 *
 * A move's text comes back from the engine as an `editorText` frame, which the composer
 * takes as its draft: this branch keeps one conversation state, so there is no draft to
 * hand across a remount.
 */
import { Suspense, lazy, useCallback, useState } from "react";

import type { SnapshotTreeNode } from "#domain/conversation/tree";
import type { TreeFilterMode } from "#protocol/conversation/frames";

import { branchBlocked } from "./branch-rules.ts";
import type { TreeMove } from "./tree-dialog.tsx";
import type { Conversation } from "./use-conversation.ts";

/**
 * The dialogs are mounted with the page, as main mounts them, so closing one plays its
 * exit motion; the chunks still arrive on their own, and the tree is read when one opens.
 */
const SessionTreeDialog = lazy(() =>
	import("./tree-dialog.tsx").then((module) => ({ default: module.SessionTreeDialog })),
);
const ForkSessionDialog = lazy(() =>
	import("./fork-dialog.tsx").then((module) => ({ default: module.ForkSessionDialog })),
);

export function useBranching({
	conversation,
	tree,
	filterMode,
	empty,
	busy,
	isCompacting,
}: {
	conversation: Conversation;
	tree: ReadonlyArray<SnapshotTreeNode>;
	/** pi's default tree filter, from the engine's settings. */
	filterMode: TreeFilterMode;
	empty: boolean;
	busy: boolean;
	isCompacting: boolean;
}) {
	const [treeOpen, setTreeOpen] = useState(false);
	const [forkOpen, setForkOpen] = useState(false);
	const [cloning, setCloning] = useState(false);
	const blocked = branchBlocked(busy, isCompacting);
	const { report } = conversation;

	/** A refusal lands where every other refused command lands: the chat's own notice. */
	const attempt = useCallback(
		(action: Promise<unknown>): void => {
			void (async () => {
				try {
					await action;
				} catch (cause) {
					report(cause instanceof Error ? cause.message : String(cause));
				}
			})();
		},
		[report],
	);

	const openTree = useCallback(() => setTreeOpen(true), []);
	const openFork = useCallback(() => setForkOpen(true), []);

	/** pi copies the active branch into a new session file; the page follows the new id. */
	const clone = useCallback((): void => {
		if (cloning || empty || blocked !== undefined) return;
		setCloning(true);
		void (async () => {
			try {
				await conversation.clone();
			} catch (cause) {
				report(cause instanceof Error ? cause.message : String(cause));
			} finally {
				setCloning(false);
			}
		})();
	}, [conversation, report, empty, blocked, cloning]);

	/**
	 * Move the leaf to a point in the tree. A user message goes back into the box from the
	 * engine's own answer; another entry starts that composer empty, as pi's `/tree` does.
	 */
	const move = (node: SnapshotTreeNode, options: TreeMove): void => {
		setTreeOpen(false);
		attempt(conversation.navigateTree(node.entryId, options));
	};

	const dialogs = (
		<Suspense fallback={null}>
			<SessionTreeDialog
				open={treeOpen}
				onOpenChange={setTreeOpen}
				tree={tree}
				filterMode={filterMode}
				blocked={blocked}
				loadTree={conversation.loadTree}
				onMove={move}
				onFilterModeChange={(mode) => attempt(conversation.setTreeFilterMode(mode))}
				onLabel={(entryId, label) => attempt(conversation.setTreeLabel(entryId, label))}
			/>
			<ForkSessionDialog open={forkOpen} onOpenChange={setForkOpen} conversation={conversation} />
		</Suspense>
	);

	return { blocked, cloning, openTree, openFork, clone, dialogs };
}
