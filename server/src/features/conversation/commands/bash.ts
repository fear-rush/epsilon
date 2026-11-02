/**
 * A command typed in the composer's shell mode, and the abort that stops it.
 * `executeBash` resolves when the command finishes, so the running state is
 * reported first: that is what lets a tab offer `abort_bash` while it runs.
 */
import type { Command } from "shared";

import type { CommandTarget } from "./context";

export const runBash = async (
	target: CommandTarget,
	command: Extract<Command, { type: "bash" }>,
): Promise<void> => {
	const running = target.agent.executeBash(command.command, undefined, {
		excludeFromContext: command.excludeFromContext,
	});
	target.resync();
	await running;
	target.resync();
};

export const abortBash = (target: CommandTarget): void => {
	target.agent.abortBash();
	target.resync();
};
