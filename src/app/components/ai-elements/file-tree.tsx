import { ChevronRightIcon, FileIcon, FolderIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/cn";

type FileNode = {
	name: string;
	path: string;
	/** The path itself is a file; a folder can be both when `a` and `a/b` both exist. */
	file: boolean;
	children: FileNode[];
};

/** Paths into a tree: folders first, then files, each by name. */
const buildTree = (paths: ReadonlyArray<string>): ReadonlyArray<FileNode> => {
	const root: FileNode = { children: [], file: false, name: "", path: "" };
	for (const path of paths) {
		const parts = path.split("/").filter((part) => part !== "");
		let parent = root;
		for (const [index, name] of parts.entries()) {
			const nodePath = parts.slice(0, index + 1).join("/");
			let node = parent.children.find((child) => child.path === nodePath);
			if (node === undefined) {
				node = { children: [], file: false, name, path: nodePath };
				parent.children.push(node);
			}
			parent = node;
		}
		parent.file = true;
	}
	const sortTree = (nodes: FileNode[]): void => {
		nodes.sort((a, b) => {
			const aFolder = a.children.length > 0;
			const bFolder = b.children.length > 0;
			if (aFolder !== bFolder) return aFolder ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		for (const node of nodes) sortTree([...node.children]);
	};
	sortTree(root.children);
	return root.children;
};

function FileRow({
	node,
	selected,
	onSelect,
}: {
	node: FileNode;
	selected: string | undefined;
	onSelect: (path: string) => void;
}) {
	return (
		<Button
			variant="ghost"
			size="sm"
			className={cn(
				"w-full justify-start font-normal",
				selected === node.path && "bg-muted text-foreground",
			)}
			aria-current={selected === node.path ? "true" : undefined}
			onClick={() => onSelect(node.path)}
		>
			<FileIcon />
			<span className="truncate">{node.name}</span>
		</Button>
	);
}

function TreeNode({
	node,
	selected,
	onSelect,
}: {
	node: FileNode;
	selected: string | undefined;
	onSelect: (path: string) => void;
}) {
	if (node.children.length === 0) {
		return (
			<li role="treeitem" className="min-w-0">
				{node.file ? <FileRow node={node} selected={selected} onSelect={onSelect} /> : undefined}
			</li>
		);
	}

	return (
		<li role="treeitem" className="min-w-0">
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
					<ul className="mt-0.5 ml-3 flex min-w-0 flex-col gap-0.5 border-l pl-1.5">
						{node.file ? (
							<li role="treeitem" className="min-w-0">
								<FileRow node={node} selected={selected} onSelect={onSelect} />
							</li>
						) : undefined}
						{node.children.map((child) => (
							<TreeNode key={child.path} node={child} selected={selected} onSelect={onSelect} />
						))}
					</ul>
				</CollapsibleContent>
			</Collapsible>
		</li>
	);
}

/**
 * The files an agent changed, as folders that open. The tree is only a view: the caller
 * owns what a selected path means, so the same tree can show a diff, a file or nothing.
 */
export function FileTree({
	paths,
	selected,
	onSelect,
	label = "Files",
}: {
	paths: ReadonlyArray<string>;
	selected: string | undefined;
	onSelect: (path: string) => void;
	label?: string;
}) {
	const nodes = buildTree(paths);
	return (
		<ul role="tree" aria-label={label} className="flex min-w-0 flex-col gap-0.5">
			{nodes.map((node) => (
				<TreeNode key={node.path} node={node} selected={selected} onSelect={onSelect} />
			))}
		</ul>
	);
}
