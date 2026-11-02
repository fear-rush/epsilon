/**
 * Labelling one entry of the session tree. pi writes a `label` entry to the file and
 * keeps the label in its manager, so the tree, the file and a terminal all agree; an
 * empty label clears it.
 */
import type { Command } from "shared";

import type { CommandTarget } from "./context";

export const setLabel = (
	target: CommandTarget,
	command: Extract<Command, { type: "set_label" }>,
): void => {
	const label = command.label?.trim();
	target.agent.sessionManager.appendLabelChange(
		command.entryId,
		label === undefined || label === "" ? undefined : label,
	);
	target.resync();
};
