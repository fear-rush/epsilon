import { Effect, Schema } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";

import { reduce } from "#domain/conversation/reduce";
import { isWritable } from "#domain/conversation/selectors";
import { emptyConversation } from "#domain/conversation/state";
import type { ConversationState } from "#domain/conversation/state";
import type { Command } from "#protocol/conversation/commands";
import type { DialogAnswer } from "#protocol/conversation/extui";
import type { ServerFrame } from "#protocol/conversation/frames";
import { ModelOptions, ToolsView } from "#protocol/conversation/session";
import type { ModelOption, ThinkingLevel } from "#protocol/conversation/session";
import {
	CommandRefused,
	EngineLimitReached,
	EngineStopped,
	ProjectNotTrusted,
	ProjectRefused,
} from "#protocol/errors";
import { call, keepSubscribed, runStream } from "@/runtime";

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
	readonly writable: boolean;
	readonly send: (text: string) => Promise<void>;
	readonly answer: (answer: DialogAnswer) => Promise<void>;
	readonly loadOlder: () => Promise<void>;
	readonly reload: () => Promise<void>;
	readonly abort: () => Promise<void>;
	readonly compact: () => Promise<void>;
	readonly setModel: (provider: string, modelId: string) => Promise<void>;
	readonly setThinking: (level: ThinkingLevel) => Promise<void>;
	readonly setTools: (names: ReadonlyArray<string>) => Promise<void>;
	readonly navigateTree: (targetId: string) => Promise<void>;
	/** Ask the engine for the tree; the answer arrives as a frame and lands in state. */
	readonly loadTree: () => Promise<void>;
	readonly models: () => Promise<ReadonlyArray<ModelOption>>;
	readonly tools: () => Promise<ToolsView>;
	/** Which tool cards are open, kept above the rows so unmounting one does not forget it. */
	readonly toolOpen: ReadonlyMap<string, boolean>;
	readonly toggleTool: (toolCallId: string) => void;
};

/** How long a message waits for the chat to open before it is refused. */
const OPEN_TIMEOUT_MS = 10_000;

/** A command is answered by a tagged error; a composer shows the sentence, not the tag. */
const commandFailure = (error: Error): Error => {
	if (error instanceof EngineStopped) {
		return new Error("The engine that owns this chat stopped. Send again to start a new one.");
	}
	if (error instanceof CommandRefused) return new Error(error.reason);
	if (error instanceof EngineLimitReached) {
		return new Error(
			"Every chat engine is busy. Close an idle chat or raise the limit in Settings.",
		);
	}
	if (error instanceof ProjectRefused) return new Error(error.reason);
	return error;
};

const notice = (text: string): ServerFrame => ({
	id: crypto.randomUUID(),
	kind: "error",
	text,
	t: "notice",
});

/** The one sentence a refused attach deserves in the transcript. */
const describe = (error: Error): string => {
	if (error instanceof EngineLimitReached) {
		return "Every chat engine is busy. Close an idle chat or raise the limit in Settings.";
	}
	if (error instanceof EngineStopped) {
		return "The engine that owns this chat stopped. Send a message to start a new one.";
	}
	if (error instanceof ProjectNotTrusted) {
		return "This chat runs in a folder that is not trusted. Open Settings → Projects to trust it.";
	}
	if (error instanceof ProjectRefused) return `This chat could not open: ${error.reason}`;
	return `This chat could not continue: ${error.message}`;
};

export function useConversation(input: {
	readonly sessionId: string;
	/** The project a new chat runs in, or null for Epsilon's own chat folder. */
	readonly place: string | null;
}): Conversation {
	const { sessionId, place } = input;
	// The route keys the chat by session id, so this state never has to reset itself.
	const [state, setState] = useState<ConversationState>(() => ({
		...emptyConversation,
		sessionId,
	}));
	const tab = useRef<string | undefined>(undefined);
	// A message typed before the chat opened waits here instead of racing the attach.
	const waiting = useRef<Array<(value: string | Error) => void>>([]);
	const currentId = useRef(sessionId);
	const entries = useRef(state.entries);
	const hasOlder = useRef(state.hasOlder);
	const busy = useRef(state.busy);
	const loadingOlder = useRef(false);
	/** The engine's stream ended; the next command subscribes again and starts one. */
	const stopped = useRef(false);
	const [epoch, setEpoch] = useState(0);
	const [toolOpen, setToolOpen] = useState<ReadonlyMap<string, boolean>>(new Map());

	// Commands are sent from event handlers, which read the latest rendered state here.
	useEffect(() => {
		entries.current = state.entries;
		hasOlder.current = state.hasOlder;
		busy.current = state.busy;
	}, [state.entries, state.hasOlder, state.busy]);

	// Settling a waiter clears its timeout before it is dropped.
	const settle = useCallback((value: string | Error): void => {
		const queued = waiting.current;
		waiting.current = [];
		for (const resolve of queued) resolve(value);
	}, []);

	/** The tab name is set when the server's first frame arrives: the chat is open then. */
	const opened = useCallback(
		(name: string): void => {
			if (tab.current === name) return;
			tab.current = name;
			settle(name);
		},
		[settle],
	);

	const tabFor = useCallback((): Promise<string> => {
		const current = tab.current;
		if (current !== undefined) return Promise.resolve(current);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				waiting.current = waiting.current.filter((entry) => entry !== waiter);
				reject(new Error("The chat did not open. Check the status line, then try again."));
			}, OPEN_TIMEOUT_MS);
			const waiter = (value: string | Error): void => {
				clearTimeout(timer);
				if (value instanceof Error) reject(value);
				else resolve(value);
			};
			waiting.current.push(waiter);
		});
	}, []);

	const dispatch = useCallback(
		(frame: ServerFrame) => {
			if (frame.t === "prepend") loadingOlder.current = false;
			setState((previous) => {
				const next = reduce(previous, frame);
				currentId.current = next.sessionId ?? sessionId;
				return next;
			});
		},
		[sessionId],
	);

	const attempt = useCallback(
		() =>
			Effect.gen(function* () {
				// A new name per connection, so a reconnect receives a fresh window rather
				// than a replay it might have missed.
				const name = crypto.randomUUID();
				// The tab belongs to this attempt only. When the connection drops, the name
				// goes with it, so a command waits for the next attempt instead of writing to
				// a tab the new connection never subscribed.
				yield* Effect.ensuring(
					runStream(
						(client) => client["conversation.attach"]({ place, sessionId, tab: name }),
						(frame) => {
							opened(name);
							dispatch(frame);
						},
					),
					Effect.sync(() => {
						if (tab.current === name) tab.current = undefined;
					}),
				);
			}),
		// All three are read inside the Effect.gen below, which the rule cannot see through.
		// oxlint-disable-next-line react/memo-dependencies
		[sessionId, place, dispatch, opened],
	);

	const onEnd = useCallback(
		(error: Error | undefined) => {
			tab.current = undefined;
			stopped.current = true;
			settle(error ?? new Error("The engine stopped before this chat opened."));
			dispatch(
				notice(
					error === undefined
						? "The engine for this chat stopped. Send a message to start a new one."
						: describe(error),
				),
			);
		},
		[dispatch, settle],
	);

	useEffect(() => {
		currentId.current = sessionId;
		tab.current = undefined;
		stopped.current = false;
		return keepSubscribed(attempt, onEnd);
		// `epoch` exists only to re-subscribe after the engine stopped.
		// oxlint-disable-next-line react/exhaustive-effect-dependencies
	}, [sessionId, attempt, onEnd, epoch]);

	/** Subscribes again, then waits for the new tab to open. The old one is dead. */
	const reattach = useCallback(async (): Promise<string> => {
		tab.current = undefined;
		stopped.current = false;
		setEpoch((current) => current + 1);
		return tabFor();
	}, [tabFor]);

	const command = useCallback(
		async (value: Command) => {
			// A chat whose engine stopped subscribes again before it sends; the attach starts
			// a new process from the file, which is what the notice promised.
			const name = stopped.current ? await reattach() : await tabFor();
			try {
				await call((client) =>
					client["conversation.command"]({
						command: value,
						sessionId: currentId.current,
						tab: name,
					}),
				);
			} catch (cause) {
				const error = cause instanceof Error ? cause : new Error(String(cause));
				// The engine behind this tab is gone, which is what a restart looks like: the
				// message was not delivered, so attach again and send it once more.
				if (error instanceof EngineStopped) {
					const fresh = await reattach();
					await call((client) =>
						client["conversation.command"]({
							command: value,
							sessionId: currentId.current,
							tab: fresh,
						}),
					);
					return;
				}
				throw commandFailure(error);
			}
		},
		[reattach, tabFor],
	);

	const send = useCallback(
		async (text: string) => {
			await command({ images: undefined, t: "prompt", text });
		},
		[command],
	);

	const answer = useCallback(
		(value: DialogAnswer) => command({ answer: value, t: "answerDialog" }),
		[command],
	);

	const loadOlder = useCallback(async () => {
		const first = entries.current[0];
		if (first === undefined || !hasOlder.current || busy.current || loadingOlder.current) return;
		loadingOlder.current = true;
		await command({ before: first.id, t: "loadHistory" });
	}, [command]);

	const reload = useCallback(async () => command({ t: "reloadFromDisk" }), [command]);
	const abort = useCallback(async () => command({ t: "abort" }), [command]);
	const compact = useCallback(async () => command({ t: "compact" }), [command]);
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
		async (targetId: string) => command({ t: "navigateTree", targetId }),
		[command],
	);
	const loadTree = useCallback(async () => command({ t: "loadTree" }), [command]);

	/** A read-only question to the engine; the answer is decoded by its own schema. */
	const ask = useCallback(
		async (kind: "models" | "tools") => {
			const name = stopped.current ? await reattach() : await tabFor();
			return call((client) =>
				client["conversation.query"]({
					kind,
					sessionId: currentId.current,
					tab: name,
				}),
			);
		},
		[reattach, tabFor],
	);
	const models = useCallback(
		async (): Promise<ReadonlyArray<ModelOption>> =>
			Schema.decodeUnknownSync(ModelOptions)(await ask("models")),
		[ask],
	);
	const tools = useCallback(
		async (): Promise<ToolsView> => Schema.decodeUnknownSync(ToolsView)(await ask("tools")),
		[ask],
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
		answer,
		compact,
		loadOlder,
		loadTree,
		models,
		navigateTree,
		reload,
		send,
		setModel,
		setThinking,
		setTools,
		state,
		toggleTool,
		toolOpen,
		tools,
		writable: isWritable(state),
	};
}
