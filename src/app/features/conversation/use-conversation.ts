import { isWritable } from "#domain/conversation/selectors";
import type { ConversationState } from "#domain/conversation/state";
import type { PermissionMode } from "#domain/permission/rules";
import type { ExportedSession, ExportFormat } from "#protocol/conversation/export";
import type { DialogAnswer } from "#protocol/conversation/extui";
import type { ImageBlock, TreeFilterMode } from "#protocol/conversation/frames";
import type { AutocompleteReply } from "#protocol/conversation/palette";
import type { ModelOption, ThinkingLevel, ToolsView } from "#protocol/conversation/session";

import { useConversationCommands } from "./use-conversation-commands";
import { useConversationStream } from "./use-conversation-stream";

/**
 * One open chat: the frames the engine sends, reduced into what the page shows, plus the
 * few commands the page can send back.
 *
 * The subscription lives for the lifetime of the component. A dropped socket ends it; the
 * link waits for the next connection and the attempt is repeated with a new tab name, so
 * the page receives a fresh window instead of the frames it missed. A chat that the engine
 * refused is not retried: its refusal becomes the next notice.
 */
export type Conversation = {
	readonly state: ConversationState;
	/** The first snapshot arrived; before that the chat is still opening. */
	readonly loaded: boolean;
	readonly writable: boolean;
	readonly send: (text: string, images?: ReadonlyArray<ImageBlock>) => Promise<void>;
	readonly answer: (answer: DialogAnswer) => Promise<void>;
	readonly loadOlder: () => Promise<void>;
	/** An older page is in flight; the transcript says so above the first row. */
	readonly loadingOlder: boolean;
	/** The last older page did not arrive, in words the reader can act on. */
	readonly olderFailure: string | undefined;
	readonly reload: () => Promise<void>;
	readonly abort: () => Promise<void>;
	readonly compact: (instructions?: string) => Promise<void>;
	readonly setModel: (provider: string, modelId: string) => Promise<void>;
	readonly setThinking: (level: ThinkingLevel) => Promise<void>;
	readonly setTools: (names: ReadonlyArray<string>) => Promise<void>;
	readonly navigateTree: (targetId: string, options?: TreeMoveOptions) => Promise<void>;
	readonly setTreeLabel: (entryId: string, label: string | undefined) => Promise<void>;
	readonly setTreeFilterMode: (mode: TreeFilterMode) => Promise<void>;
	/** Copy the active branch into a new session file and follow it there. */
	readonly clone: () => Promise<void>;
	readonly fork: (entryId: string, position: "before" | "at") => Promise<void>;
	/** Ask the engine for the tree; the answer arrives as a frame and lands in state. */
	readonly loadTree: () => Promise<void>;
	readonly models: () => Promise<ReadonlyArray<ModelOption>>;
	readonly tools: () => Promise<ToolsView>;
	/** Which tool cards are open, kept above the rows so unmounting one does not forget it. */
	readonly toolOpen: ReadonlyMap<string, boolean>;
	readonly toggleTool: (toolCallId: string) => void;
	/** A shell command, as pi's `!cmd` runs one; `!!` keeps it out of the context. */
	readonly bash: (text: string, excludeFromContext?: boolean) => Promise<void>;
	readonly abortBash: () => Promise<void>;
	readonly cancelRetry: () => Promise<void>;
	readonly abortCompaction: () => Promise<void>;
	readonly clearQueue: () => Promise<void>;
	/** Join a run that is already going: steer it now, or wait for it to settle. */
	readonly steer: (text: string, images?: ReadonlyArray<ImageBlock>) => Promise<void>;
	readonly followUp: (text: string, images?: ReadonlyArray<ImageBlock>) => Promise<void>;
	readonly setCodingTools: (enabled: boolean) => Promise<void>;
	readonly setAutoCompaction: (enabled: boolean) => Promise<void>;
	readonly setAutoRetry: (enabled: boolean) => Promise<void>;
	readonly setHideThinking: (hidden: boolean) => Promise<void>;
	/** What an extension's autocomplete providers suggest at the caret. */
	readonly suggest: (text: string, cursor: number) => Promise<AutocompleteReply>;
	/** Switch the permission mode through the bundled extension's own command. */
	readonly setPermission: (mode: PermissionMode) => Promise<void>;
	/** pi's own exporter, through the engine that owns the session. */
	readonly exportSession: (format: ExportFormat) => Promise<ExportedSession>;
	/** Show a failure this tab caused itself where a refused command appears. */
	readonly report: (cause: unknown) => void;
};

/** What a tree move may do to the branch it leaves. */
export type TreeMoveOptions = {
	readonly summarize?: boolean;
	readonly customInstructions?: string;
	readonly replaceInstructions?: boolean;
};

export function useConversation(input: {
	readonly sessionId: string;
	/** The project a new chat runs in, or null for Epsilon's own chat folder. */
	readonly place: string | null;
}): Conversation {
	const stream = useConversationStream(input);
	const commands = useConversationCommands(stream.command, stream.ask);

	return {
		...commands,
		loaded: stream.loaded,
		loadOlder: stream.loadOlder,
		loadingOlder: stream.loadingOlder,
		olderFailure: stream.olderFailure,
		report: stream.report,
		state: stream.state,
		writable: isWritable(stream.state),
	};
}
