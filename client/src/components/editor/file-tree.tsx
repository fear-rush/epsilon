import { ChevronRightIcon, FileIcon, FolderIcon, Trash2Icon } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/cn";

import { Tip } from "@/components/patterns/tip";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** One file of the tree: a path with `/` between folders. */
export type FileTreeEntry = {
	path: string;
	/** Listed but not selectable, such as a binary file. */
	disabled?: boolean;
};

/** What a row's delete button names: a file, or a folder holding no file. */
export type FileTreeTarget = { path: string; folder: boolean };

type Node = {
	name: string;
	path: string;
	entry?: FileTreeEntry;
	children: Node[];
	folder: boolean;
};

/**
 * The tree's nodes: one per file path segment, plus the folders the list names,
 * which is how a folder with no files yet still shows. Folders first, then files,
 * each by name; `first` leads the root.
 */
const build = (
	files: readonly FileTreeEntry[],
	folders: readonly string[],
	first: string | undefined,
): Node[] => {
	const root: Node = { name: "", path: "", children: [], folder: true };
	const nodeFor = (path: string): Node => {
		let parent = root;
		const parts = path.split("/");
		for (const [index, name] of parts.entries()) {
			const segment = parts.slice(0, index + 1).join("/");
			let node = parent.children.find((child) => child.path === segment);
			if (node === undefined) {
				node = { name, path: segment, children: [], folder: false };
				parent.children.push(node);
			}
			parent = node;
		}
		return parent;
	};
	const folderPaths = new Set(folders);
	for (const path of folders) nodeFor(path);
	for (const entry of files) nodeFor(entry.path).entry = entry;
	const mark = (nodes: Node[]): void => {
		for (const node of nodes) {
			node.folder = node.children.length > 0 || folderPaths.has(node.path);
			mark(node.children);
		}
	};
	mark(root.children);
	const order = (nodes: Node[], top: boolean): void => {
		nodes.sort((a, b) => {
			if (top && first !== undefined && (a.path === first || b.path === first)) {
				return a.path === first ? -1 : 1;
			}
			if (a.folder !== b.folder) return a.folder ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		for (const node of nodes) order(node.children, false);
	};
	order(root.children, true);
	return root.children;
};

const ROW =
	"flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 [&_svg]:size-4 [&_svg]:shrink-0";

/**
 * A file tree in the manner of shadcn's collapsible file-tree block: folders are
 * `Collapsible`s, files are buttons, and the selected file is marked.
 */
export function FileTree({
	files,
	folders = [],
	selected,
	first,
	disabledHint,
	onSelect,
	onDelete,
	protectedPaths = [],
}: {
	files: readonly FileTreeEntry[];
	/** Folders to list even when they hold no file, such as one just created. */
	folders?: readonly string[];
	selected: string | undefined;
	/** A path to list before everything else, such as `SKILL.md`. */
	first?: string;
	/** Tooltip for a disabled file. */
	disabledHint?: string;
	onSelect: (path: string) => void;
	/**
	 * Offered on a file other than the protected ones, and on a folder that holds
	 * nothing, so the button appears only where the action can work.
	 */
	onDelete?: (target: FileTreeTarget) => void;
	/** Paths listed but never deleted, such as the skill's own `SKILL.md`. */
	protectedPaths?: readonly string[];
}) {
	const nodes = useMemo(() => build(files, folders, first), [files, folders, first]);
	return (
		<ul className="grid min-w-0 gap-0.5" role="tree" aria-label="Files">
			{nodes.map((node) => (
				<TreeNode
					key={node.path}
					node={node}
					selected={selected}
					disabledHint={disabledHint}
					onSelect={onSelect}
					onDelete={onDelete}
					protectedPaths={protectedPaths}
				/>
			))}
		</ul>
	);
}

/** The row's trash, over its right edge: always there on a touch screen. */
function RowDelete({
	path,
	folder,
	onDelete,
}: FileTreeTarget & { onDelete: (target: FileTreeTarget) => void }) {
	return (
		<span className="absolute inset-y-0 right-1 flex items-center opacity-0 transition-opacity group-hover/entry:opacity-100 group-focus-within/entry:opacity-100 pointer-coarse:opacity-100">
			<Tip label={`Delete ${path}`}>
				<Button
					type="button"
					variant="destructive"
					size="icon-sm"
					aria-label={`Delete ${path}`}
					onClick={() => onDelete({ path, folder })}
				>
					<Trash2Icon />
				</Button>
			</Tip>
		</span>
	);
}

function TreeNode({
	node,
	selected,
	disabledHint,
	onSelect,
	onDelete,
	protectedPaths,
}: {
	node: Node;
	selected: string | undefined;
	disabledHint: string | undefined;
	onSelect: (path: string) => void;
	onDelete: ((target: FileTreeTarget) => void) | undefined;
	protectedPaths: readonly string[];
}) {
	const deletable = onDelete !== undefined && !protectedPaths.includes(node.path);
	if (node.entry === undefined) {
		// A folder with nothing in it yet: shown, but there is nothing to open.
		if (node.children.length === 0) {
			return (
				<li role="treeitem" className="group/entry relative">
					<div
						className={cn(
							ROW,
							"cursor-default text-muted-foreground hover:bg-transparent",
							deletable && "pr-8",
						)}
					>
						<span className="size-4" aria-hidden />
						<FolderIcon />
						<span className="truncate">{node.name}</span>
					</div>
					{deletable && onDelete !== undefined && (
						<RowDelete path={node.path} folder onDelete={onDelete} />
					)}
				</li>
			);
		}
		return (
			<li role="treeitem">
				<Collapsible defaultOpen>
					<CollapsibleTrigger className={cn(ROW, "group/folder")}>
						<ChevronRightIcon className="transition-transform group-aria-expanded/folder:rotate-90 group-data-panel-open/folder:rotate-90" />
						<FolderIcon />
						<span className="truncate">{node.name}</span>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<ul role="group" className="mt-0.5 ml-3 grid gap-0.5 border-l pl-1.5">
							{node.children.map((child) => (
								<TreeNode
									key={child.path}
									node={child}
									selected={selected}
									disabledHint={disabledHint}
									onSelect={onSelect}
									onDelete={onDelete}
									protectedPaths={protectedPaths}
								/>
							))}
						</ul>
					</CollapsibleContent>
				</Collapsible>
			</li>
		);
	}
	const disabled = node.entry.disabled === true;
	const row = (
		<button
			type="button"
			aria-disabled={disabled}
			className={cn(
				ROW,
				deletable && "pr-8",
				node.path === selected && "bg-muted font-medium",
				disabled && "cursor-default text-muted-foreground hover:bg-transparent",
			)}
			onClick={() => {
				if (!disabled) onSelect(node.path);
			}}
		>
			<FileIcon />
			<span className="truncate">{node.name}</span>
		</button>
	);
	return (
		<li role="treeitem" aria-selected={node.path === selected} className="group/entry relative">
			{disabled && disabledHint !== undefined ? (
				<Tooltip>
					<TooltipTrigger render={row} />
					<TooltipContent>{disabledHint}</TooltipContent>
				</Tooltip>
			) : (
				row
			)}
			{deletable && onDelete !== undefined && (
				<RowDelete path={node.path} folder={false} onDelete={onDelete} />
			)}
		</li>
	);
}
