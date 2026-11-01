/**
 * One user message of the active branch, drawn the same way by both lists of them:
 * the composer's "Go back" menu, which moves the leaf, and the session menu's "Fork
 * from a message…" dialog, which copies the branch up to it. Each supplies the
 * element that takes the click, so the row itself is only the number and the text.
 */
import type { SnapshotBranch } from "shared";

/** The first line of a message, so every row in a list stays one line tall. */
const firstLine = (text: string): string => text.trimStart().split("\n")[0] ?? "";

export function BranchRow({
	branch,
	index,
	multiline = false,
}: {
	branch: SnapshotBranch;
	index: number;
	/** Let a long message use a second line; the dialog list stays one line per row. */
	multiline?: boolean;
}) {
	return (
		<>
			<span className="w-6 shrink-0 text-right text-meta text-muted-foreground tabular-nums">
				{index + 1}
			</span>
			<span
				className={
					multiline ? "line-clamp-2 min-w-0 flex-1 break-words" : "min-w-0 flex-1 truncate"
				}
			>
				{firstLine(branch.text)}
			</span>
		</>
	);
}
