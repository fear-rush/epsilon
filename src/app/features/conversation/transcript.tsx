import { LoaderCircleIcon, CircleAlertIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { entryLabel } from "#domain/conversation/content";
import { transcript } from "#domain/conversation/selectors";
import type { ConversationState } from "#domain/conversation/state";
import type { SnapshotTreeNode } from "#domain/conversation/tree";
import { InlineStatus } from "@/components/patterns/status/inline-status";
import { Button } from "@/components/ui/button";

import { RAIL_SLOTS, TranscriptRail } from "./transcript-rail";
import { Row } from "./transcript-rows";
import type { TranscriptRow } from "./transcript-rows";
import { useTranscriptScroll } from "./use-transcript-scroll";

/**
 * The conversation.
 *
 * A short chat renders every row; above ~150 rows only the rows near the viewport are
 * mounted, so a 50,000-entry chat still opens quickly and Ctrl+F keeps working where it
 * matters. Rows are keyed by entry id, never by position, so an older page arriving at the
 * top does not renumber what is on screen. The virtualizer owns scrolling: `anchorTo: "end"`
 * keeps the view still while older pages prepend, and `followOnAppend` follows a reply only
 * when the reader is already at the end.
 *
 * Sending is the one time the page moves on purpose: the sent message scrolls to the top of
 * the view and the reply grows below it (R9).
 */

/** The text a search can find in one row. */
export const rowText = (row: TranscriptRow): string => {
	if (row.kind === "entry") return entryLabel(row.entry);
	if (row.kind === "run")
		return row.steps
			.map((step) => `${step.thinking} ${step.call.toolName} ${step.run?.output ?? ""}`)
			.join(" ");
	return row.turn.blocks.map((block) => block?.text ?? "").join(" ");
};

/** The active branch's user messages in tree order, for a rail wider than the window. */
const treeUserRows = (
	tree: ReadonlyArray<SnapshotTreeNode>,
): ReadonlyArray<{ readonly id: string; readonly text: string }> => {
	const users: Array<{ id: string; text: string }> = [];
	const stack = [...tree].toReversed();
	while (stack.length > 0) {
		const node = stack.pop();
		if (node === undefined) continue;
		if (node.kind === "user" && node.active) users.push({ id: node.entryId, text: node.text });
		for (let index = node.children.length - 1; index >= 0; index -= 1) {
			const child = node.children[index];
			if (child !== undefined) stack.push(child);
		}
	}
	return users;
};

export function Transcript({
	state,
	onLoadOlder,
	loadingOlder,
	olderFailure,
	onLoadTree,
	anchorFrom,
	onAnchored,
	toolOpen,
	onToggleTool,
}: {
	state: ConversationState;
	onLoadOlder: () => void;
	/** The engine is reading the page before this window. */
	loadingOlder: boolean;
	/** The last page did not arrive; the transcript offers a retry. */
	olderFailure: string | undefined;
	/** Read the branch tree, so a rail wider than the loaded window can list every turn. */
	onLoadTree: () => Promise<void>;
	/** The row index a sent message will land at or after; scroll it to the top. */
	anchorFrom?: number | undefined;
	onAnchored: () => void;
	toolOpen: ReadonlyMap<string, boolean>;
	onToggleTool: (toolCallId: string) => void;
}) {
	const rows = transcript(state);
	const treeAsked = useRef(false);
	const userRows = rows.flatMap((row) =>
		row.kind === "entry" && row.entry.role === "user" ? [{ id: row.id, text: rowText(row) }] : [],
	);
	const treeUsers = useMemo(() => treeUserRows(state.tree), [state.tree]);
	// The tree is already read when the picker opens; this is the same on-demand read for a
	// window that has fewer than five user turns, so the rail does not disappear in a long
	// assistant reply. A short chat with fewer than five turns still has none.
	useEffect(() => {
		if (treeAsked.current) return;
		if (state.tree.length > 0 || !state.hasOlder || userRows.length >= RAIL_SLOTS) return;
		treeAsked.current = true;
		void onLoadTree().catch(() => {
			treeAsked.current = false;
		});
	}, [onLoadTree, state.hasOlder, state.tree.length, userRows.length]);
	const railRows =
		userRows.length >= RAIL_SLOTS ? userRows : treeUsers.length > 0 ? treeUsers : userRows;

	const {
		activeUserId,
		announcement,
		jumpToEnd,
		jumpToRow,
		onScroll,
		requestOlder,
		scroll,
		setPulling,
		virtual,
		virtualizer,
	} = useTranscriptScroll({
		anchorFrom,
		olderFailure,
		onAnchored,
		onLoadOlder,
		railRows,
		rows,
		state,
	});

	return (
		<>
			<div className="flex min-h-0 flex-1">
				<TranscriptRail
					rows={railRows}
					activeId={activeUserId}
					onJump={jumpToRow}
					onJumpEnd={jumpToEnd}
				/>
				<div
					ref={scroll}
					role="feed"
					aria-busy={state.busy}
					aria-label="Conversation"
					data-slot="chat"
					onScroll={onScroll}
					onWheel={() => setPulling(false)}
					onTouchMove={() => setPulling(false)}
					className="h-full min-w-0 flex-1 overflow-y-auto px-page"
				>
					{/* A zero-height line that stays at the top of the viewport while a page loads;
					    it takes no space from the transcript, so nothing moves under it. */}
					{loadingOlder || olderFailure !== undefined ? (
						<output className="sticky top-0 z-10 flex h-0 justify-center">
							<span className="mt-2 flex animate-enter-drop items-center gap-2 rounded-pill border bg-background/95 px-3 py-1 text-meta text-muted-foreground shadow-sm backdrop-blur">
								{olderFailure === undefined ? (
									<>
										<LoaderCircleIcon aria-hidden="true" className="size-icon-sm animate-spin" />
										Loading earlier messages
									</>
								) : (
									<>
										<InlineStatus icon={CircleAlertIcon} tone="danger">
											{olderFailure}
										</InlineStatus>
										<Button variant="ghost" size="xs" onClick={requestOlder}>
											Retry
										</Button>
									</>
								)}
							</span>
						</output>
					) : undefined}
					{virtual ? (
						<div
							className="relative mx-auto w-full max-w-content"
							style={{ height: virtualizer.getTotalSize() }}
						>
							{virtualizer.getVirtualItems().map((item) => {
								const row = rows[item.index];
								if (row === undefined) return null;
								return (
									<article
										key={item.key}
										ref={virtualizer.measureElement}
										data-index={item.index}
										data-row-id={row.id}
										aria-posinset={item.index + 1}
										aria-setsize={rows.length}
										className="absolute inset-x-0 top-0"
										style={{ transform: `translateY(${item.start}px)` }}
									>
										<Row row={row} state={state} toolOpen={toolOpen} onToggleTool={onToggleTool} />
									</article>
								);
							})}
						</div>
					) : (
						<div className="mx-auto flex w-full max-w-content flex-col gap-6 py-8">
							{rows.map((row, index) => (
								<article
									key={row.id}
									data-row-id={row.id}
									aria-posinset={index + 1}
									aria-setsize={rows.length}
									className="animate-enter-rise"
								>
									<Row row={row} state={state} toolOpen={toolOpen} onToggleTool={onToggleTool} />
								</article>
							))}
						</div>
					)}
				</div>
			</div>
			{/* The feed is not a live region itself; a finished reply is announced once. */}
			<div aria-live="polite" className="sr-only">
				{announcement}
			</div>
		</>
	);
}
