/**
 * pi's three ways to branch, owned by the page because the session controls and
 * the composer both reach them. The composer answers `/tree`, `/fork` and
 * `/clone` with this, and the session controls' Branch group calls the same
 * actions. The dialogs are rendered once by the page (SessionView), so the
 * composer stays only the owner of its draft.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import type { SnapshotTreeNode } from "shared";

import { cloneSession } from "@/api/endpoints";
import { sessionKeys } from "@/api/keys";
import { branchBlocked } from "./branch-rules";
import { clearPendingDraft, setPendingDraft } from "./pending-draft";
import type { ConversationStore } from "./store";
import { ForkSessionDialog } from "./fork-dialog";
import { SessionTreeDialog } from "./tree-dialog";

/**
 * A draft the tree handed back is read by a composer mounted on the next key, so
 * the same text applies twice and the composer never sets its own state from an
 * effect. The fork's new chat uses the same handoff for its first composer.
 */
export function useBranching({
	store,
	tree,
	empty,
	project,
	busy,
	isCompacting,
}: {
	store: ConversationStore;
	tree: SnapshotTreeNode[];
	empty: boolean;
	/** The folder a copied chat opens in, so the new session runs in the same place. */
	project: string | undefined;
	busy: boolean;
	isCompacting: boolean;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [treeOpen, setTreeOpen] = useState(false);
	const [forkOpen, setForkOpen] = useState(false);
	const [cloning, setCloning] = useState(false);
	const [composerKey, setComposerKey] = useState(0);
	const blocked = branchBlocked(busy, isCompacting);

	const openTree = useCallback(() => setTreeOpen(true), []);
	const openFork = useCallback(() => setForkOpen(true), []);

	/** pi copies the active branch into a new session under an id to open next. */
	const clone = useCallback((): void => {
		if (cloning || empty || blocked !== undefined) return;
		setCloning(true);
		void (async () => {
			try {
				const id = await cloneSession(store.sessionId);
				await queryClient.invalidateQueries({ queryKey: sessionKeys.all });
				await navigate({
					to: "/sessions/$sessionId",
					params: { sessionId: id },
					search: { project },
				});
			} catch (cause) {
				store.reportProblem(cause instanceof Error ? cause.message : String(cause));
			} finally {
				setCloning(false);
			}
		})();
	}, [store, queryClient, navigate, project, empty, blocked, cloning]);

	/**
	 * Move the leaf to a point in the tree. A user message goes back into the box
	 * through a fresh composer, keyed by `composerKey`; another entry starts that
	 * composer empty, as pi's `/tree` does.
	 */
	const move = (node: SnapshotTreeNode, summarize: boolean): void => {
		if (node.kind === "user") setPendingDraft(store.sessionId, node.text);
		else clearPendingDraft(store.sessionId);
		setComposerKey((key) => key + 1);
		store.navigateTree(node.entryId, summarize);
		setTreeOpen(false);
	};

	const dialogs = (
		<>
			<SessionTreeDialog
				open={treeOpen}
				onOpenChange={setTreeOpen}
				tree={tree}
				blocked={blocked}
				onMove={move}
			/>
			<ForkSessionDialog
				open={forkOpen}
				onOpenChange={setForkOpen}
				sessionId={store.sessionId}
				project={project}
				tree={tree}
			/>
		</>
	);

	return { blocked, cloning, composerKey, openTree, openFork, clone, dialogs };
}
