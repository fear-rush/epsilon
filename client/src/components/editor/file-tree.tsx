import { ChevronRightIcon, FileIcon, FolderIcon } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/cn";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** One file of the tree: a path with `/` between folders. */
export type FileTreeEntry = {
	path: string;
	/** Listed but not selectable, such as a binary file. */
	disabled?: boolean;
};

type Node = { name: string; path: string; entry?: FileTreeEntry; children: Node[] };

/** Folders first, then files, each by name; `first` leads the root. */
const build = (files: readonly FileTreeEntry[], first: string | undefined): Node[] => {
	const root: Node = { name: "", path: "", children: [] };
	for (const entry of files) {
		let parent = root;
		const parts = entry.path.split("/");
		for (const [index, name] of parts.entries()) {
			const path = parts.slice(0, index + 1).join("/");
			const last = index === parts.length - 1;
			let node = parent.children.find((child) => child.path === path);
			if (node === undefined) {
				node = { name, path, children: [] };
				parent.children.push(node);
			}
			if (last) node.entry = entry;
			parent = node;
		}
	}
	const order = (nodes: Node[], top: boolean): void => {
		nodes.sort((a, b) => {
			if (top && first !== undefined && (a.path === first || b.path === first)) {
				return a.path === first ? -1 : 1;
			}
			const folders = Number(b.children.length > 0) - Number(a.children.length > 0);
			return folders !== 0 ? folders : a.name.localeCompare(b.name);
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
	selected,
	first,
	disabledHint,
	onSelect,
}: {
	files: readonly FileTreeEntry[];
	selected: string | undefined;
	/** A path to list before everything else, such as `SKILL.md`. */
	first?: string;
	/** Tooltip for a disabled file. */
	disabledHint?: string;
	onSelect: (path: string) => void;
}) {
	const nodes = useMemo(() => build(files, first), [files, first]);
	return (
		<ul className="grid min-w-0 gap-0.5" role="tree" aria-label="Files">
			{nodes.map((node) => (
				<TreeNode
					key={node.path}
					node={node}
					selected={selected}
					disabledHint={disabledHint}
					onSelect={onSelect}
				/>
			))}
		</ul>
	);
}

function TreeNode({
	node,
	selected,
	disabledHint,
	onSelect,
}: {
	node: Node;
	selected: string | undefined;
	disabledHint: string | undefined;
	onSelect: (path: string) => void;
}) {
	if (node.entry === undefined) {
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
		<li role="treeitem" aria-selected={node.path === selected}>
			{disabled && disabledHint !== undefined ? (
				<Tooltip>
					<TooltipTrigger render={row} />
					<TooltipContent>{disabledHint}</TooltipContent>
				</Tooltip>
			) : (
				row
			)}
		</li>
	);
}
