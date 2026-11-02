/**
 * The command dispatch table: one row per `Command` a tab may send. A row is the
 * call on the embedded `AgentSession` and nothing else; `session.ts` owns the
 * engine's lifetime, the command result and the frames.
 */
import type { Command } from "shared";

import { runAutocomplete } from "./autocomplete";
import { abortBash, runBash } from "./bash";
import type { CommandTarget } from "./context";
import { runPrompt } from "./prompt";
import {
	abort,
	abortCompaction,
	cancelRetry,
	clearQueue,
	compact,
	reload,
	reloadFromDisk,
	setAutoCompaction,
	setAutoRetry,
	setCodingToolsEnabled,
	setHideThinking,
	setModel,
	setThinkingLevel,
} from "./session-controls";
import { navigateTree } from "./tree";

export type { CommandTarget } from "./context";

type CommandHandlers = {
	[K in Command["type"]]: (
		target: CommandTarget,
		command: Extract<Command, { type: K }>,
	) => Promise<void> | void;
};

const HANDLERS: CommandHandlers = {
	prompt: runPrompt,
	abort: (target) => abort(target),
	bash: runBash,
	abort_bash: (target) => abortBash(target),
	reload: (target) => reload(target),
	reload_session: (target) => reloadFromDisk(target),
	compact,
	abort_compaction: (target) => abortCompaction(target),
	set_auto_compaction: setAutoCompaction,
	cancel_retry: (target) => cancelRetry(target),
	set_auto_retry: setAutoRetry,
	clear_queue: (target) => clearQueue(target),
	set_model: setModel,
	set_thinking_level: setThinkingLevel,
	set_coding_tools: setCodingToolsEnabled,
	set_hide_thinking: setHideThinking,
	navigate_tree: navigateTree,
	autocomplete: runAutocomplete,
};

/** Run one command a tab sent, and reject with the reason the engine or host gave. */
export const runCommand = async (target: CommandTarget, command: Command): Promise<void> => {
	// SAFETY: the table has a row for every `Command["type"]`, so the row this name
	// selects takes exactly the command that named it.
	const handler = HANDLERS[command.type] as (
		target: CommandTarget,
		command: Command,
	) => Promise<void> | void;
	await handler(target, command);
};
