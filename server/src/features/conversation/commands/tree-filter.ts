/**
 * pi's default tree filter. The setting lives in `settings.json` and a terminal's tree
 * reads the same value, so the dashboard writes it through pi's own setter instead of
 * keeping a filter in the browser.
 */
import type { Command } from "shared";

import type { CommandTarget } from "./context";

export const setTreeFilterMode = async (
	target: CommandTarget,
	command: Extract<Command, { type: "set_tree_filter_mode" }>,
): Promise<void> => {
	target.agent.settingsManager.setTreeFilterMode(command.mode);
	await target.agent.settingsManager.flush();
	target.resync();
};
