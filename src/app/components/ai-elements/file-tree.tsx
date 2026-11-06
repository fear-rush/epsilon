import { ChevronRightIcon, FileIcon, FolderIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";

export type FileTreeEntry = {
	path: string;
	/** Listed but not selectable, such as a binary file. */
	disabled?: boolean;
};

/** What a row's delete button names: a file, or a folder holding no file. */
export type FileTreeTarget = { path: string; folder: boolean };

type FileNode = {
	name: string;
	path: string;
	entry?: FileTreeEntry;
	children: FileNode[];
	folder: boolean;
};

/**
 * The tree's nodes: one per file path segment, plus the folders the list names, which is
 * how a folder with no files yet still shows. Folders first, then files, each by name;
 * `first` leads the root.
 */
const build = (
	files: ReadonlyArray<FileTreeEntry>,
	folders: ReadonlyArray<string>,
	first: string | undefined,
): FileNode[] => {
	const root: FileNode = { children: [], folder: true, name: "", path: "" };
	const nodeFor = (path: string): FileNode => {
		let parent = root;
		const parts = path.split("/");
		for (const [index, name] of parts.entries()) {
			const segment = parts.slice(0, index + 1).join("/");
			let node = parent.children.find((child) => child.path === segment);
			if (node === undefined) {
				node = { children: [], folder: false, name, path: segment };
				parent.children.push(node);
			}
			parent = node;
		}
		return parent;
	};
	const folderPaths = new Set(folders);
	for (const path of folders) nodeFor(path);
	for (const entry of files) nodeFor(entry.path).entry = entry;
	const mark = (nodes: FileNode[]): void => {
		for (const node of nodes) {
			node.folder = node.children.length > 0 || folderPaths.has(node.path);
			mark(node.children);
		}
	};
	mark(root.children);
	const order = (nodes: FileNode[], top: boolean): void => {
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

const fileRow = (
	node: FileNode,
	selected: string | undefined,
	onSelect: (path: string) => void,
): React.ReactElement => {
	const disabled = node.entry?.disabled === true;
	return (
		<Button
			variant="ghost"
			size="sm"
			className={cn(
				"w-full justify-start font-normal",
				selected === node.path && "bg-muted font-medium text-foreground",
				disabled && "text-muted-foreground",
			)}
			aria-current={selected === node.path ? "true" : undefined}
			aria-disabled={disabled}
			onClick={() => {
				if (!disabled) onSelect(node.path);
			}}
		>
			<FileIcon />
			<span className="truncate">{node.name}</span>
		</Button>
	);
};

/** The row's trash, over its right edge: always there on a touch screen. */
function RowDelete({
	path,
	folder,
	onDelete,
}: FileTreeTarget & { onDelete: (target: FileTreeTarget) => void }) {
	return (
		<span className="absolute inset-y-0 right-1 flex items-center opacity-0 transition-opacity group-focus-within/entry:opacity-100 group-hover/entry:opacity-100 pointer-coarse:opacity-100">
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							type="button"
							variant="destructive"
							size="icon-sm"
							aria-label={`Delete ${path}`}
							onClick={() => onDelete({ folder, path })}
						/>
					}
				>
					<Trash2Icon />
				</TooltipTrigger>
				<TooltipContent>{`Delete ${path}`}</TooltipContent>
			</Tooltip>
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
	node: FileNode;
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
							"flex h-7 w-full min-w-0 items-center gap-1 rounded-lg px-3 text-body text-muted-foreground",
							deletable && "pr-8",
						)}
					>
						<span className="size-4" aria-hidden />
						<FolderIcon />
						<span className="truncate">{node.name}</span>
					</div>
					{deletable && <RowDelete folder onDelete={onDelete} path={node.path} />}
				</li>
			);
		}
		return (
			<li role="treeitem">
				<Collapsible defaultOpen>
					<CollapsibleTrigger
						aria-label={node.name}
						render={
							<Button
								variant="ghost"
								size="sm"
								className="w-full justify-start font-normal aria-expanded:bg-transparent aria-expanded:hover:bg-muted dark:aria-expanded:hover:bg-muted/50"
							/>
						}
					>
						<ChevronRightIcon className="transition-transform duration-150 group-data-panel-open/button:rotate-90" />
						<FolderIcon />
						<span className="truncate">{node.name}</span>
					</CollapsibleTrigger>
					<CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-panel data-ending-style:h-0 data-starting-style:h-0">
						<ul role="group" className="mt-0.5 ml-3 flex min-w-0 flex-col gap-0.5 border-l pl-1.5">
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
	const row = fileRow(node, selected, onSelect);
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
			{deletable && <RowDelete folder={false} onDelete={onDelete} path={node.path} />}
		</li>
	);
}

/**
 * The files an agent changed, or the files of a skill, as folders that open. The tree is
 * only a view: the caller owns what a selected path means. A file may be listed but not
 * selectable, and an editable tree may offer a delete on a file or an empty folder.
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
	label = "Files",
}: {
	files: ReadonlyArray<FileTreeEntry>;
	/** Folders to list even when they hold no file, such as one just created. */
	folders?: ReadonlyArray<string>;
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
	label?: string;
}) {
	const nodes = build(files, folders, first);
	return (
		<ul role="tree" aria-label={label} className="flex min-w-0 flex-col gap-0.5">
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
