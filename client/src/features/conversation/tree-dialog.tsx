/**
 * The session tree: every message and summary pi can move the leaf to, including
 * the branches the transcript no longer shows. Picking a user message puts its
 * text back in the composer; picking any other entry continues after it. This is
 * the `/tree` command's dialog and the way an abandoned branch stays reachable
 * (docs/DECISIONS.md, Branching).
 */
import { BotIcon, FileTextIcon, GitBranchIcon, MapPinIcon, UserRoundIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { SnapshotTreeNode } from "shared";
import { cn } from "@/lib/cn";

import { DialogFrame } from "@/components/patterns/dialog/dialog-frame";
import { InlineStatus } from "@/components/patterns/status/inline-status";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const ROLES = {
	user: { label: "You", icon: UserRoundIcon },
	assistant: { label: "Agent", icon: BotIcon },
	summary: { label: "Summary", icon: FileTextIcon },
} as const;

export function SessionTreeDialog({
	open,
	onOpenChange,
	tree,
	blocked,
	onMove,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	tree: SnapshotTreeNode[];
	/** Why pi refuses to move the leaf right now; undefined when it is possible. */
	blocked: string | undefined;
	/** Move the leaf, summarising the branch left behind when asked. */
	onMove: (node: SnapshotTreeNode, summarize: boolean) => void;
}) {
	const [summarize, setSummarize] = useState(false);
	const currentRef = useRef<HTMLButtonElement>(null);

	// The current point can sit below the fold in a long chat, so open at it.
	useEffect(() => {
		if (!open) return;
		const frame = requestAnimationFrame(() =>
			currentRef.current?.scrollIntoView({ block: "center" }),
		);
		return () => cancelAnimationFrame(frame);
	}, [open, tree]);

	return (
		<DialogFrame
			open={open}
			onOpenChange={onOpenChange}
			size="lg"
			title="Session tree"
			description="Every message and summary, including branches you left. Picking a user message fills the box; picking a reply continues there."
			footer={
				<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
					Close
				</Button>
			}
		>
			<div className="flex flex-col gap-field">
				<label
					htmlFor="tree-summarize"
					className="flex items-center gap-2 text-meta text-muted-foreground"
				>
					<Checkbox
						id="tree-summarize"
						checked={summarize}
						onCheckedChange={(checked) => setSummarize(checked === true)}
					/>
					Summarise the branch I leave
				</label>
				{blocked !== undefined && <Notice tone="warning">{blocked}</Notice>}
				{tree.length === 0 ? (
					<InlineStatus icon={GitBranchIcon}>This chat has no message to move to yet.</InlineStatus>
				) : (
					<TreeRows
						nodes={tree}
						disabled={blocked !== undefined}
						currentRef={currentRef}
						onPick={(node) => onMove(node, summarize)}
					/>
				)}
			</div>
		</DialogFrame>
	);
}

/** How many branch points a row's indentation may show before it stops growing. */
const MAX_INDENT = 4;

type TreeRowView = { node: SnapshotTreeNode; depth: number };

/**
 * Rows in pre-order, with only a real fork adding a level. A single child is the
 * next message on the same path, so it stays at its parent's depth; that keeps a
 * tool-heavy turn from becoming one step deeper per reply.
 */
const flattenRows = (nodes: SnapshotTreeNode[], depth: number): TreeRowView[] => {
	const rows: TreeRowView[] = [];
	for (const node of nodes) {
		rows.push({ node, depth });
		if (node.children.length === 1) rows.push(...flattenRows(node.children, depth));
		else if (node.children.length > 1) rows.push(...flattenRows(node.children, depth + 1));
	}
	return rows;
};

function TreeRows({
	nodes,
	disabled,
	currentRef,
	onPick,
}: {
	nodes: SnapshotTreeNode[];
	disabled: boolean;
	currentRef: RefObject<HTMLButtonElement | null>;
	onPick: (node: SnapshotTreeNode) => void;
}) {
	const rows = flattenRows(nodes, 0);

	return (
		<ul className="flex min-w-0 flex-col">
			{rows.map(({ node, depth }) => {
				const role = ROLES[node.kind];
				const Icon = role.icon;
				const preview = node.text.trim() === "" ? "No text" : node.text;
				const indent = Math.min(depth, MAX_INDENT);
				// User turns anchor a branch; replies and summaries stay secondary. This
				// keeps a long run of agent text from reading as the main list.
				const prominent = node.current || (node.active && node.kind === "user");
				return (
					<li
						key={node.entryId}
						className="min-w-0"
						style={
							indent === 0
								? undefined
								: { paddingInlineStart: `calc(${indent} * var(--spacing-field))` }
						}
					>
						<button
							type="button"
							ref={node.current ? currentRef : undefined}
							aria-current={node.current ? "location" : undefined}
							disabled={disabled || node.current}
							className={cn(
								"flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-default",
								node.current && "bg-muted",
							)}
							onClick={() => onPick(node)}
						>
							<Icon
								className={cn(
									"size-4 shrink-0",
									prominent ? "text-foreground" : "text-muted-foreground",
								)}
								aria-hidden
							/>
							<span className="w-12 shrink-0 text-meta text-muted-foreground">{role.label}</span>
							<span
								className={cn(
									"min-w-0 flex-1 truncate text-body",
									prominent ? "text-foreground" : "text-muted-foreground",
								)}
							>
								{node.label !== undefined && (
									<span className="text-meta text-muted-foreground">{node.label} · </span>
								)}
								{preview}
							</span>
							{node.current && (
								<span className="flex shrink-0 items-center gap-1 text-meta text-muted-foreground">
									<MapPinIcon className="size-3.5" aria-hidden />
									Here
								</span>
							)}
						</button>
					</li>
				);
			})}
		</ul>
	);
}
