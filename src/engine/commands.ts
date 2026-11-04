import { Effect } from "effect";
import type { FileSystem, Scope } from "effect";

import type { Command } from "#protocol/conversation/commands";
import type { DialogAnswer } from "#protocol/conversation/extui";
import type { ImageBlock } from "#protocol/conversation/frames";
import type { ThinkingLevel } from "#protocol/conversation/session";
import { CommandRefused } from "#protocol/errors";

/**
 * What a command may touch. The session answers for read-only state and owns the three
 * write paths pi exposes; this file only decides which one a command means, so the
 * refusal text lives in one place.
 */
export type CommandHost = {
	/** Set once a foreign write was seen; writes are refused until a reload. */
	readonly drift: string | undefined;
	readonly prompt: (
		text: string,
		images: ReadonlyArray<ImageBlock> | undefined,
	) => Effect.Effect<void, CommandRefused, FileSystem.FileSystem | Scope.Scope>;
	readonly steer: (
		text: string,
		images: ReadonlyArray<ImageBlock> | undefined,
	) => Effect.Effect<void, CommandRefused, FileSystem.FileSystem | Scope.Scope>;
	readonly followUp: (
		text: string,
		images: ReadonlyArray<ImageBlock> | undefined,
	) => Effect.Effect<void, CommandRefused, FileSystem.FileSystem | Scope.Scope>;
	readonly abort: () => Effect.Effect<void, CommandRefused, FileSystem.FileSystem | Scope.Scope>;
	readonly answerDialog: (
		answer: DialogAnswer,
	) => Effect.Effect<void, CommandRefused, FileSystem.FileSystem | Scope.Scope>;
	readonly loadHistory: (
		tab: string,
		before: string,
	) => Effect.Effect<void, CommandRefused, FileSystem.FileSystem | Scope.Scope>;
	readonly loadTree: (
		tab: string,
	) => Effect.Effect<void, CommandRefused, FileSystem.FileSystem | Scope.Scope>;
	readonly navigateTree: (targetId: string) => Effect.Effect<void, CommandRefused>;
	readonly setModel: (provider: string, modelId: string) => Effect.Effect<void, CommandRefused>;
	readonly setThinking: (level: ThinkingLevel) => Effect.Effect<void, CommandRefused>;
	readonly setTools: (names: ReadonlyArray<string>) => Effect.Effect<void, CommandRefused>;
	readonly compact: () => Effect.Effect<void, CommandRefused>;
	readonly abortCompaction: () => Effect.Effect<void, CommandRefused>;
	readonly setAutoCompaction: (enabled: boolean) => Effect.Effect<void, CommandRefused>;
	readonly cancelRetry: () => Effect.Effect<void, CommandRefused>;
	readonly setAutoRetry: (enabled: boolean) => Effect.Effect<void, CommandRefused>;
	/** Empty pi's queue and put its text back in the composer. */
	readonly clearQueue: () => Effect.Effect<void, CommandRefused>;
	readonly bash: (text: string, excludeFromContext: boolean) => Effect.Effect<void, CommandRefused>;
	readonly abortBash: () => Effect.Effect<void, CommandRefused>;
	readonly setHideThinking: (hidden: boolean) => Effect.Effect<void, CommandRefused>;
	readonly setCodingTools: (enabled: boolean) => Effect.Effect<void, CommandRefused>;
	readonly setLabel: (label: string) => Effect.Effect<void, CommandRefused>;
	readonly fork: (
		entryId: string,
		position: "before" | "at",
	) => Effect.Effect<void, CommandRefused>;
	readonly reloadFromDisk: () => Effect.Effect<
		void,
		CommandRefused,
		FileSystem.FileSystem | Scope.Scope
	>;
};

const refused = (command: string, reason: string) => new CommandRefused({ command, reason });

const writeRefusal = (host: CommandHost, command: string) =>
	host.drift === undefined
		? undefined
		: refused(command, `This chat changed outside Epsilon (${host.drift}). Reload it first.`);

const textCommand = (
	host: CommandHost,
	command: Extract<Command, { t: "prompt" | "steer" | "followUp" }>,
): Effect.Effect<void, CommandRefused, FileSystem.FileSystem | Scope.Scope> => {
	const refusal = writeRefusal(host, command.t);
	if (refusal !== undefined) return Effect.fail(refusal);
	const images = command.images ?? undefined;
	if (command.t === "prompt") return host.prompt(command.text, images);
	if (command.t === "steer") return host.steer(command.text, images);
	return host.followUp(command.text, images);
};

/** One browser command, run on the live session. */
export const dispatchCommand = (
	host: CommandHost,
	tab: string,
	command: Command,
): Effect.Effect<void, CommandRefused, FileSystem.FileSystem | Scope.Scope> => {
	switch (command.t) {
		case "prompt":
		case "steer":
		case "followUp":
			return textCommand(host, command);
		case "abort":
			return host.abort();
		case "answerDialog":
			return host.answerDialog(command.answer);
		case "loadHistory":
			return host.loadHistory(tab, command.before);
		case "loadTree":
			return host.loadTree(tab);
		case "navigateTree":
			return host.navigateTree(command.targetId);
		case "setModel":
			return host.setModel(command.provider, command.modelId);
		case "setThinking":
			return host.setThinking(command.level);
		case "setTools":
			return host.setTools(command.names);
		case "compact":
			return host.compact();
		case "abortCompaction":
			return host.abortCompaction();
		case "setAutoCompaction":
			return host.setAutoCompaction(command.enabled);
		case "cancelRetry":
			return host.cancelRetry();
		case "setAutoRetry":
			return host.setAutoRetry(command.enabled);
		case "clearQueue":
			return host.clearQueue();
		case "bash":
			return host.bash(command.text, command.excludeFromContext ?? false);
		case "abortBash":
			return host.abortBash();
		case "setHideThinking":
			return host.setHideThinking(command.hidden);
		case "setCodingTools":
			return host.setCodingTools(command.enabled);
		case "setLabel": {
			// The name is written into the session file, so a foreign write refuses it too.
			const refusal = writeRefusal(host, "setLabel");
			if (refusal !== undefined) return Effect.fail(refusal);
			return host.setLabel(command.label);
		}
		case "fork":
			return host.fork(command.entryId, command.position ?? "before");
		case "reloadFromDisk":
			return host.reloadFromDisk();
		default: {
			const unreachable: never = command;
			return Effect.die(unreachable);
		}
	}
};
