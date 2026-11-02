/**
 * A command typed in the composer's shell mode, and the abort that stops it.
 *
 * pi's TUI emits `user_bash` before running a `!cmd`, so an extension can block
 * or replace it, and `AgentSession.executeBash` does not. The host emits it here,
 * which is what makes such an extension work from the dashboard too. The run gets
 * an id so every streamed chunk lands in its own output and not the next run's.
 */
import type { Command } from "shared";

import type { CommandTarget } from "./context";

export const runBash = async (
	target: CommandTarget,
	command: Extract<Command, { type: "bash" }>,
): Promise<void> => {
	const agent = target.agent;
	const exclusion = { excludeFromContext: command.excludeFromContext };
	// An extension that answers with a result handled the command itself; pi's own
	// rule is that a failure here never falls back to running it locally.
	const handled = await agent.extensionRunner.emitUserBash({
		type: "user_bash",
		command: command.command,
		excludeFromContext: command.excludeFromContext,
		cwd: agent.sessionManager.getCwd(),
	});
	if (handled?.result !== undefined) {
		agent.recordBashResult(command.command, handled.result, exclusion);
		target.resync();
		return;
	}
	const running = agent.executeBash(command.command, undefined, {
		...exclusion,
		id: crypto.randomUUID(),
		operations: handled?.operations,
	});
	target.resync();
	await running;
	target.resync();
};

export const abortBash = (target: CommandTarget): void => {
	target.agent.abortBash();
	target.resync();
};
