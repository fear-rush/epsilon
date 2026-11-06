import { argsOf } from "#domain/conversation/tools";
import type { AssistantEntry } from "#protocol/conversation/frames";

/** One file an assistant turn wrote, with the lines it removed and added. */
export type ChangedFile = {
	readonly path: string;
	/** A write creates the file's content rather than changing part of it. */
	readonly created: boolean;
	readonly edits: ReadonlyArray<{ readonly oldText: string; readonly newText: string }>;
};

/**
 * The files one assistant message changed, in call order, with every edit to the same
 * path under one row. A write replaces what an edit said before it, because the file on
 * disk is what the write left.
 */
export function changedFilesOf(entry: AssistantEntry): ReadonlyArray<ChangedFile> {
	const files = new Map<string, ChangedFile>();
	for (const block of entry.blocks) {
		if (block.type !== "toolCall") continue;
		const args = argsOf(block.toolName, block.args);
		if (args?.kind === "edit") {
			const before = files.get(args.path);
			files.set(args.path, {
				created: before?.created ?? false,
				edits: [...(before?.edits ?? []), ...args.edits],
				path: args.path,
			});
		} else if (args?.kind === "write") {
			files.set(args.path, {
				created: true,
				edits: [{ newText: args.content, oldText: "" }],
				path: args.path,
			});
		}
	}
	return [...files.values()];
}
