import type { SnapshotTreeNode } from "#domain/conversation/tree";
import type { TreeFilterMode } from "#protocol/conversation/frames";

/**
 * pi's tree filters, applied to the rows the engine sent. A hidden row promotes its
 * children instead of taking a whole branch with it, so a filter never loses a
 * message that should still be reachable.
 */
export const filterTree = (
	nodes: ReadonlyArray<SnapshotTreeNode>,
	mode: TreeFilterMode,
): SnapshotTreeNode[] =>
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
	if (mode === "all") return true;
	if (mode === "default") return node.kind !== "settings";
	if (mode === "user-only") return node.kind === "user";
	if (mode === "labeled-only") return node.label !== undefined;
	// "no-tools": messages, summaries and labels stay; tool results and bookkeeping go.
	return node.kind !== "tool" && node.kind !== "settings";
};
