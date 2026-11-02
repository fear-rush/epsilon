import type { SnapshotTreeNode, TreeFilterMode } from "shared";

/**
 * pi's tree filters, applied to the rows the engine sent. A hidden row promotes its
 * children instead of taking a whole branch with it, so a filter never loses a
 * message that should still be reachable.
 */
export const filterTree = (nodes: SnapshotTreeNode[], mode: TreeFilterMode): SnapshotTreeNode[] =>
	nodes.flatMap((node) => {
		const children = filterTree(node.children, mode);
		return keep(node, mode) ? [{ ...node, children }] : children;
	});

/**
 * pi's own rules: an assistant row with no text is hidden unless it is the current
 * position (an error or abort counts as text, set by the engine), and the default
 * and no-tools views hide the bookkeeping rows that `all` shows.
 */
const keep = (node: SnapshotTreeNode, mode: TreeFilterMode): boolean => {
	if (node.kind === "assistant" && !node.hasText && !node.current) return false;
	switch (mode) {
		case "user-only":
			return node.kind === "user";
		case "no-tools":
			return node.kind !== "tool" && node.kind !== "settings";
		case "labeled-only":
			return node.label !== undefined;
		case "all":
			return true;
		case "default":
			return node.kind !== "settings";
	}
};
