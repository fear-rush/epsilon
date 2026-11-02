/**
 * pi's own session operations: the model, the thinking level, the tool switch,
 * the compactions, the retries, the queue and the two reloads. Each row is one
 * call on the embedded session, plus the snapshot the tabs need afterwards.
 */
import type { Command } from "shared";

import { setCodingTools } from "../engine";
import type { CommandTarget } from "./context";

export const abort = async (target: CommandTarget): Promise<void> => {
	target.cancelDialogs();
	await target.agent.abort();
};

export const reload = async (target: CommandTarget): Promise<void> => {
	await target.reload();
};

export const reloadFromDisk = async (target: CommandTarget): Promise<void> => {
	await target.reloadFromDisk();
};

export const compact = async (
	target: CommandTarget,
	command: Extract<Command, { type: "compact" }>,
): Promise<void> => {
	// pi aborts the running turn before it compacts, so a busy session takes this.
	// A refusal (`Nothing to compact`) is pi's message to the tab.
	await target.agent.compact(command.instructions);
	target.resync();
};

export const abortCompaction = (target: CommandTarget): void => {
	target.agent.abortCompaction();
	target.resync();
};

export const setAutoCompaction = (
	target: CommandTarget,
	command: Extract<Command, { type: "set_auto_compaction" }>,
): void => {
	target.agent.setAutoCompactionEnabled(command.enabled);
	target.resync();
};

export const cancelRetry = (target: CommandTarget): void => {
	target.agent.abortRetry();
	target.resync();
};

export const setAutoRetry = (
	target: CommandTarget,
	command: Extract<Command, { type: "set_auto_retry" }>,
): void => {
	target.agent.setAutoRetryEnabled(command.enabled);
	target.resync();
};

export const clearQueue = (target: CommandTarget): void => {
	target.agent.clearQueue();
	target.resync();
};

/**
 * Resolve against the list the browser was offered, so a pick can never name a
 * pair the engine will refuse.
 */
export const setModel = async (
	target: CommandTarget,
	command: Extract<Command, { type: "set_model" }>,
): Promise<void> => {
	const offered = target.models.some(
		(candidate) => candidate.provider === command.provider && candidate.id === command.modelId,
	);
	const model = target.agent.modelRuntime.getModel(command.provider, command.modelId);
	if (!offered || model === undefined) {
		throw new Error(`Model not found: ${command.provider}/${command.modelId}`);
	}
	await target.agent.setModel(model);
	target.resync();
};

export const setThinkingLevel = (
	target: CommandTarget,
	command: Extract<Command, { type: "set_thinking_level" }>,
): void => {
	target.agent.setThinkingLevel(command.level);
	target.resync();
};

export const setCodingToolsEnabled = (
	target: CommandTarget,
	command: Extract<Command, { type: "set_coding_tools" }>,
): void => {
	setCodingTools(target.agent, command.enabled);
	target.resync();
};

/**
 * pi's own writer for its global `hideThinkingBlock` setting, so a terminal sees
 * what the dashboard chose and nothing is hand-written.
 */
export const setHideThinking = (
	target: CommandTarget,
	command: Extract<Command, { type: "set_hide_thinking" }>,
): void => {
	target.agent.settingsManager.setHideThinkingBlock(command.enabled);
	target.resync();
};
