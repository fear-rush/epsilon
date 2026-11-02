/**
 * Moving the leaf to an entry of the session tree, which may be on another branch.
 * pi refuses while a run or a compaction is going, and that refusal is the tab's
 * answer.
 */
import type { Command } from "shared";

import type { CommandTarget } from "./context";

export const navigateTree = async (
	target: CommandTarget,
	command: Extract<Command, { type: "navigate_tree" }>,
): Promise<void> => {
	// A user message moves the leaf to its parent and hands its text back for the
	// editor; any other entry becomes the leaf. The tab already holds a user
	// message's text, so the snapshot says the rest.
	const result = await target.agent.navigateTree(command.entryId, {
		summarize: command.summarize === true,
	});
	if (result.cancelled) throw new Error("Navigation was cancelled");
	target.resync();
};
