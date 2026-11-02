/**
 * The session tree: every entry pi can move the leaf to, including the branches the
 * transcript no longer shows. Picking a user message puts its text back in the
 * composer; picking any other entry continues after it. This is the `/tree`
 * command's dialog and the way an abandoned branch stays reachable
 * (docs/DECISIONS.md, Branching).
 *
 * The filter is pi's own `treeFilterMode` setting, read from the engine and written
 * back through its setter. Labels are pi's `label` entries on a target entry, so the
 * file, a terminal and this dialog show the same ones.
 */
import {
	BotIcon,
	FileTextIcon,
	GitBranchIcon,
	MapPinIcon,
	SlidersHorizontalIcon,
	UserRoundIcon,
	WrenchIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { SnapshotTreeNode, TreeFilterMode } from "shared";
import { cn } from "@/lib/cn";

import { DialogFrame } from "@/components/patterns/dialog/dialog-frame";
import { InlineStatus } from "@/components/patterns/status/inline-status";
import { Notice } from "@/components/patterns/status/notice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { filterTree } from "./tree-filter";

const ROLES = {
	user: { label: "You", icon: UserRoundIcon },
	assistant: { label: "Agent", icon: BotIcon },
	summary: { label: "Summary", icon: FileTextIcon },
	tool: { label: "Tool", icon: WrenchIcon },
	settings: { label: "State", icon: SlidersHorizontalIcon },
} as const;

const MODES: { value: TreeFilterMode; label: string }[] = [
	{ value: "default", label: "Default" },
	{ value: "no-tools", label: "No tools" },
	{ value: "user-only", label: "User only" },
	{ value: "labeled-only", label: "Labeled" },
	{ value: "all", label: "All" },
];

export type TreeMove = {
	summarize: boolean;
	customInstructions?: string;
	/** Make the instructions replace pi's summary prompt instead of adding to it. */
	replaceInstructions?: boolean;
};

export function SessionTreeDialog({
	open,
	onOpenChange,
	tree,
	filterMode,
	blocked,
	onMove,
	onFilterModeChange,
	onLabel,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	tree: SnapshotTreeNode[];
	/** pi's default tree filter, from `settings.json`. */
	filterMode: TreeFilterMode;
	/** Why pi refuses to move the leaf right now; undefined when it is possible. */
	blocked: string | undefined;
	/** Move the leaf, summarising the branch left behind when asked. */
	onMove: (node: SnapshotTreeNode, options: TreeMove) => void;
	/** Write the chosen mode through pi's setter, so a terminal reads the same value. */
	onFilterModeChange: (mode: TreeFilterMode) => void;
	/** Set or clear one entry's label; pi writes it to the session file. */
	onLabel: (entryId: string, label: string | undefined) => void;
}) {
	const [summarize, setSummarize] = useState(false);
	const [customInstructions, setCustomInstructions] = useState("");
	const [replaceInstructions, setReplaceInstructions] = useState(false);
	const currentRef = useRef<HTMLButtonElement>(null);
	const visible = useMemo(() => filterTree(tree, filterMode), [tree, filterMode]);
	const rows = useMemo(() => flattenRows(visible, 0), [visible]);

	// The current point can sit below the fold in a long chat, so open at it.
	useEffect(() => {
		if (!open) return;
		const frame = requestAnimationFrame(() =>
			currentRef.current?.scrollIntoView({ block: "center" }),
		);
		return () => cancelAnimationFrame(frame);
	}, [open, visible]);

	return (
		<DialogFrame
			open={open}
			onOpenChange={onOpenChange}
			size="lg"
			title="Session tree"
			description="Every entry, including branches you left. Picking a user message fills the box; picking any other entry continues after it."
			footer={
				<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
					Close
				</Button>
			}
		>
			<div className="flex flex-col gap-field">
				<div className="flex items-center gap-2">
					<label htmlFor="tree-filter" className="text-meta text-muted-foreground">
						Show
					</label>
					<Select
						items={MODES}
						value={filterMode}
						onValueChange={(next) => {
							const picked = MODES.find((mode) => mode.value === next);
							if (picked !== undefined) onFilterModeChange(picked.value);
						}}
					>
						<SelectTrigger id="tree-filter" aria-label="Tree filter" className="w-36">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{MODES.map((mode) => (
									<SelectItem key={mode.value} value={mode.value}>
										{mode.label}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<span className="text-meta text-muted-foreground">pi's treeFilterMode</span>
				</div>
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
				{summarize && (
					<div className="grid gap-2 rounded-md border p-2">
						<label htmlFor="tree-instructions" className="text-meta text-muted-foreground">
							Instructions for the summary (optional)
						</label>
						<Textarea
							id="tree-instructions"
							rows={3}
							value={customInstructions}
							placeholder="What should the summary keep?"
							onChange={(event) => setCustomInstructions(event.target.value)}
						/>
						<label
							htmlFor="tree-replace"
							className="flex items-center gap-2 text-meta text-muted-foreground"
						>
							<Checkbox
								id="tree-replace"
								checked={replaceInstructions}
								onCheckedChange={(checked) => setReplaceInstructions(checked === true)}
							/>
							Replace pi's summary prompt instead of adding to it
						</label>
					</div>
				)}
				{blocked !== undefined && <Notice tone="warning">{blocked}</Notice>}
				{rows.length === 0 ? (
					<InlineStatus icon={GitBranchIcon}>
						{tree.length === 0
							? "This chat has no entry to move to yet."
							: "No entry matches this filter."}
					</InlineStatus>
				) : (
					<TreeRows
						rows={rows}
						disabled={blocked !== undefined}
						currentRef={currentRef}
						onPick={(node) =>
							onMove(node, {
								summarize,
								customInstructions:
									customInstructions.trim() === "" ? undefined : customInstructions.trim(),
								replaceInstructions,
							})
						}
					/>
				)}
				{rows.length > 0 && <TreeLabelForm rows={rows} onLabel={onLabel} />}
			</div>
		</DialogFrame>
	);
}

/** How many branch points a row's indentation may show before it stops growing. */
const MAX_INDENT = 4;

type TreeRowView = { node: SnapshotTreeNode; depth: number };

/**
 * Rows in pre-order, with only a real fork adding a level. A single child is the
 * next entry on the same path, so it stays at its parent's depth; that keeps a
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

const rowText = (node: SnapshotTreeNode): string =>
	node.text.trim() === "" ? "No text" : node.text;

function TreeRows({
	rows,
	disabled,
	currentRef,
	onPick,
}: {
	rows: TreeRowView[];
	disabled: boolean;
	currentRef: RefObject<HTMLButtonElement | null>;
	onPick: (node: SnapshotTreeNode) => void;
}) {
	return (
		<ul className="flex min-w-0 flex-col">
			{rows.map(({ node, depth }) => {
				const role = ROLES[node.kind];
				const Icon = role.icon;
				// User turns anchor a branch; replies and summaries stay secondary. This
				// keeps a long run of agent text from reading as the main list.
				const prominent = node.current || (node.active && node.kind === "user");
				const indent = Math.min(depth, MAX_INDENT);
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
								{rowText(node)}
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

/** One entry's label, written through pi so the file and a terminal agree. */
function TreeLabelForm({
	rows,
	onLabel,
}: {
	rows: TreeRowView[];
	onLabel: (entryId: string, label: string | undefined) => void;
}) {
	const [chosen, setChosen] = useState<string>();
	const [draft, setDraft] = useState<{ entryId: string; text: string }>();
	const target =
		rows.find((row) => row.node.entryId === chosen)?.node ??
		rows.find((row) => row.node.current)?.node ??
		rows[0]?.node;
	if (target === undefined) return undefined;
	const text = draft?.entryId === target.entryId ? draft.text : (target.label ?? "");
	const items = rows.map(({ node }) => ({
		value: node.entryId,
		label: `${ROLES[node.kind].label}: ${rowText(node).slice(0, 60)}`,
	}));
	const save = (): void => {
		const label = text.trim();
		onLabel(target.entryId, label === "" ? undefined : label);
		setDraft(undefined);
	};

	return (
		<div className="grid gap-2 border-t pt-field">
			<p className="text-meta text-muted-foreground">Label an entry</p>
			<div className="flex flex-wrap items-center gap-2">
				<Select
					items={items}
					value={target.entryId}
					onValueChange={(next) => {
						if (next === null) return;
						setChosen(next);
						setDraft(undefined);
					}}
				>
					<SelectTrigger aria-label="Entry to label" className="min-w-0 flex-1">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{items.map((item) => (
								<SelectItem key={item.value} value={item.value}>
									{item.label}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
				<Input
					aria-label="Label"
					value={text}
					placeholder="Label"
					className="w-40"
					onChange={(event) => setDraft({ entryId: target.entryId, text: event.target.value })}
				/>
				<Button type="button" size="sm" onClick={save}>
					Save
				</Button>
				{target.label !== undefined && (
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => {
							onLabel(target.entryId, undefined);
							setDraft(undefined);
						}}
					>
						Remove
					</Button>
				)}
			</div>
		</div>
	);
}
