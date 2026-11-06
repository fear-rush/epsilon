import { Schema } from "effect";
import { useCallback, useState } from "react";

import { withDefined } from "#domain/object";
import type { PermissionMode } from "#domain/permission/rules";
import type { Command } from "#protocol/conversation/commands";
import { ExportedSession } from "#protocol/conversation/export";
import type { ExportFormat } from "#protocol/conversation/export";
import type { DialogAnswer } from "#protocol/conversation/extui";
import type { ImageBlock, TreeFilterMode } from "#protocol/conversation/frames";
import { AutocompleteReply } from "#protocol/conversation/palette";
import { ModelOptions, ToolsView } from "#protocol/conversation/session";
import type { ModelOption, ThinkingLevel } from "#protocol/conversation/session";

import type { TreeMoveOptions } from "./use-conversation";
import type { Ask } from "./use-conversation-stream";

/**
 * The commands a chat can send: each one is a typed `Command` through the stream's
 * `command`, or a read-only question through its `ask`. The open tool cards live here too.
 */
export function useConversationCommands(command: (value: Command) => Promise<void>, ask: Ask) {
	const [toolOpen, setToolOpen] = useState<ReadonlyMap<string, boolean>>(new Map());

	const send = useCallback(
		async (text: string, images?: ReadonlyArray<ImageBlock>) => {
			await command({ images, t: "prompt", text });
		},
		[command],
	);

	const answer = useCallback(
		(value: DialogAnswer) => command({ answer: value, t: "answerDialog" }),
		[command],
	);

	const reload = useCallback(async () => command({ t: "reloadFromDisk" }), [command]);
	const abort = useCallback(async () => command({ t: "abort" }), [command]);
	const compact = useCallback(
		async (instructions?: string) => command({ instructions, t: "compact" }),
		[command],
	);
	const setModel = useCallback(
		async (provider: string, modelId: string) => command({ modelId, provider, t: "setModel" }),
		[command],
	);
	const setThinking = useCallback(
		async (level: ThinkingLevel) => command({ level, t: "setThinking" }),
		[command],
	);
	const setTools = useCallback(
		async (names: ReadonlyArray<string>) => command({ names: [...names], t: "setTools" }),
		[command],
	);
	const navigateTree = useCallback(
		async (targetId: string, options: TreeMoveOptions = {}) =>
			command(
				withDefined(
					withDefined(
						withDefined({ t: "navigateTree" as const, targetId }, "summarize", options.summarize),
						"customInstructions",
						options.customInstructions,
					),
					"replaceInstructions",
					options.replaceInstructions,
				),
			),
		[command],
	);
	const setTreeLabel = useCallback(
		async (entryId: string, label: string | undefined) =>
			command(withDefined({ t: "setTreeLabel" as const, entryId }, "label", label)),
		[command],
	);
	const setTreeFilterMode = useCallback(
		async (mode: TreeFilterMode) => command({ mode, t: "setTreeFilterMode" }),
		[command],
	);
	const clone = useCallback(async () => command({ t: "clone" }), [command]);
	const fork = useCallback(
		async (entryId: string, position: "before" | "at") => command({ entryId, position, t: "fork" }),
		[command],
	);
	const loadTree = useCallback(async () => command({ t: "loadTree" }), [command]);

	const models = useCallback(
		async (): Promise<ReadonlyArray<ModelOption>> =>
			Schema.decodeUnknownSync(ModelOptions)(await ask({ kind: "models" })),
		[ask],
	);
	const tools = useCallback(
		async (): Promise<ToolsView> =>
			Schema.decodeUnknownSync(ToolsView)(await ask({ kind: "tools" })),
		[ask],
	);
	const exportSession = useCallback(
		async (format: ExportFormat): Promise<ExportedSession> =>
			Schema.decodeUnknownSync(ExportedSession)(await ask({ format, kind: "export" })),
		[ask],
	);
	const suggest = useCallback(
		async (text: string, cursor: number): Promise<AutocompleteReply> =>
			Schema.decodeUnknownSync(AutocompleteReply)(
				await ask({ cursor, kind: "autocomplete", text }),
			),
		[ask],
	);
	const bash = useCallback(
		async (text: string, excludeFromContext = false): Promise<void> => {
			await command({ excludeFromContext, t: "bash", text });
		},
		[command],
	);
	const abortBash = useCallback(async (): Promise<void> => {
		await command({ t: "abortBash" });
	}, [command]);
	const cancelRetry = useCallback(async (): Promise<void> => {
		await command({ t: "cancelRetry" });
	}, [command]);
	const abortCompaction = useCallback(async (): Promise<void> => {
		await command({ t: "abortCompaction" });
	}, [command]);
	const clearQueue = useCallback(async (): Promise<void> => {
		await command({ t: "clearQueue" });
	}, [command]);
	const steer = useCallback(
		async (text: string, images?: ReadonlyArray<ImageBlock>): Promise<void> => {
			await command({ images, t: "steer", text });
		},
		[command],
	);
	const followUp = useCallback(
		async (text: string, images?: ReadonlyArray<ImageBlock>): Promise<void> => {
			await command({ images, t: "followUp", text });
		},
		[command],
	);
	const setCodingTools = useCallback(
		async (enabled: boolean): Promise<void> => {
			await command({ t: "setCodingTools", enabled });
		},
		[command],
	);
	const setPermission = useCallback(
		async (mode: PermissionMode): Promise<void> => {
			await command({ t: "prompt", text: `/permission ${mode}` });
		},
		[command],
	);
	const setAutoCompaction = useCallback(
		async (enabled: boolean): Promise<void> => {
			await command({ enabled, t: "setAutoCompaction" });
		},
		[command],
	);
	const setAutoRetry = useCallback(
		async (enabled: boolean): Promise<void> => {
			await command({ enabled, t: "setAutoRetry" });
		},
		[command],
	);
	const setHideThinking = useCallback(
		async (hidden: boolean): Promise<void> => {
			await command({ hidden, t: "setHideThinking" });
		},
		[command],
	);
	const toggleTool = useCallback((toolCallId: string) => {
		setToolOpen((previous) => {
			const next = new Map(previous);
			next.set(toolCallId, previous.get(toolCallId) !== true);
			return next;
		});
	}, []);

	return {
		abort,
		abortBash,
		abortCompaction,
		answer,
		bash,
		cancelRetry,
		clearQueue,
		clone,
		compact,
		exportSession,
		fork,
		followUp,
		loadTree,
		models,
		navigateTree,
		reload,
		send,
		setAutoCompaction,
		setAutoRetry,
		setCodingTools,
		setHideThinking,
		setModel,
		setPermission,
		setThinking,
		setTools,
		setTreeFilterMode,
		setTreeLabel,
		steer,
		suggest,
		toggleTool,
		toolOpen,
		tools,
	};
}
