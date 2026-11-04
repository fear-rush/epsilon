import type { TreeRow } from "#protocol/conversation/frames";

/**
 * One row of pi's branch tree with the rows that continue after it: the shape main's
 * picker draws, built in the page from the flat rows the engine sends.
 */
export type SnapshotTreeNode = TreeRow & {
	readonly children: ReadonlyArray<SnapshotTreeNode>;
};

/**
 * The flat rows as a tree. The engine sends them in tree order and names each row's
 * nearest kept ancestor, so one pass nests them without recursion: a 50,000-entry chat
 * must not overflow the stack here either.
 *
 * A row whose parent is not in the list becomes a root rather than disappearing: the
 * picker then shows it at the top, which is still a place the chat can move to.
 */
export const buildTree = (rows: ReadonlyArray<TreeRow>): ReadonlyArray<SnapshotTreeNode> => {
	const roots: SnapshotTreeNode[] = [];
	const childrenOf = new Map<string, Array<SnapshotTreeNode>>();
	for (const row of rows) {
		const children: SnapshotTreeNode[] = [];
		childrenOf.set(row.entryId, children);
		const node: SnapshotTreeNode = { ...row, children };
		const parent = row.parentId === null ? undefined : childrenOf.get(row.parentId);
		if (parent === undefined) roots.push(node);
		else parent.push(node);
	}
	return roots;
};
