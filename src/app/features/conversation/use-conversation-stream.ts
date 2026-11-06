import { Effect } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";

import { reduce } from "#domain/conversation/reduce";
import { emptyConversation } from "#domain/conversation/state";
import type { ConversationState } from "#domain/conversation/state";
import type { Command } from "#protocol/conversation/commands";
import type { ExportFormat } from "#protocol/conversation/export";
import type { ServerFrame } from "#protocol/conversation/frames";
import { EngineStopped } from "#protocol/errors";
import { errorText, errorView } from "@/components/patterns/status/error-view";
import { call, keepSubscribed, runStream } from "@/core/runtime";

import { handOffDraft } from "./draft.ts";

/** How long a message waits for the chat to open before it is refused. */
const OPEN_TIMEOUT_MS = 10_000;

export const notice = (code: "chat-ended" | "chat-error", reason?: string): ServerFrame => ({
	id: crypto.randomUUID(),
	kind: "error",
	source: "epsilon",
	code,
	data: reason === undefined ? {} : { reason },
	t: "notice",
});

/**
 * The subscription to one chat: the frames the engine sends, reduced into the state the
 * page shows, and the two ways to talk back (a command, a read-only question).
 */
export function useConversationStream(input: {
	readonly sessionId: string;
	readonly place: string | null;
}) {
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
	const olderInFlight = useRef(false);
	/** The engine's stream ended; the next command subscribes again and starts one. */
	const stopped = useRef(false);
	const [epoch, setEpoch] = useState(0);
	const [loaded, setLoaded] = useState(false);
	const [loadingOlder, setLoadingOlder] = useState(false);
	const [olderFailure, setOlderFailure] = useState<string>();

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
				reject(new Error("Couldn't open the chat. Try again."));
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
			if (frame.t === "prepend") {
				olderInFlight.current = false;
				setLoadingOlder(false);
				setOlderFailure(undefined);
			}
			if (frame.t === "snapshot") setLoaded(true);
			// A fork's text belongs to the new chat, which is not this one yet: carry it
			// across the route change and keep it out of this chat's draft, or the new
			// composer would take the same text twice.
			if (frame.t === "editorText" && frame.sessionId !== currentId.current) {
				handOffDraft(frame.sessionId, frame.text);
				return;
			}
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
		// oxlint-disable-next-line react/memo-dependencies -- all three are read inside the Effect.gen, which the rule cannot see through
		[sessionId, place, dispatch, opened],
	);

	const onEnd = useCallback(
		(error: Error | undefined) => {
			tab.current = undefined;
			stopped.current = true;
			settle(error ?? new Error("The engine stopped before this chat opened."));
			dispatch(error === undefined ? notice("chat-ended") : notice("chat-error", errorText(error)));
		},
		[dispatch, settle],
	);

	useEffect(() => {
		currentId.current = sessionId;
		tab.current = undefined;
		stopped.current = false;
		return keepSubscribed(attempt, onEnd);
		// `epoch` exists only to re-subscribe after the engine stopped.
		// oxlint-disable-next-line react/exhaustive-effect-dependencies -- epoch exists only to re-subscribe after the engine stopped
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
				throw error;
			}
		},
		[reattach, tabFor],
	);

	const loadOlder = useCallback(async () => {
		const first = entries.current[0];
		if (first === undefined || !hasOlder.current || busy.current || olderInFlight.current) return;
		olderInFlight.current = true;
		setLoadingOlder(true);
		setOlderFailure(undefined);
		try {
			await command({ before: first.id, t: "loadHistory" });
		} catch {
			// A refusal's words are the translator's, not the error's; the reader gets the
			// fact and a retry instead of an empty message.
			olderInFlight.current = false;
			setLoadingOlder(false);
			setOlderFailure("Earlier messages did not load.");
		}
	}, [command]);

	/** A read-only question to the engine; the answer is decoded by its own schema. */
	const ask = useCallback(
		async (question: {
			kind: "models" | "tools" | "autocomplete" | "export";
			text?: string;
			cursor?: number;
			format?: ExportFormat;
		}) => {
			const name = stopped.current ? await reattach() : await tabFor();
			return call((client) =>
				client["conversation.query"]({
					...question,
					sessionId: currentId.current,
					tab: name,
				}),
			);
		},
		[reattach, tabFor],
	);
	/**
	 * A failure's own words, or the translator's when it has none: a tagged refusal's
	 * `message` is empty, so its sentence has to come from `errorView`.
	 */
	const report = useCallback(
		(cause: unknown) => {
			// A report is either an error or the words a caller already has.
			const error = cause instanceof Error ? cause : new Error(String(cause));
			if (error.message.trim() !== "") {
				dispatch(notice("chat-error", error.message));
				return;
			}
			const view = errorView(error);
			dispatch(notice("chat-error", view.line === "" ? view.title : view.line));
		},
		[dispatch],
	);

	return { ask, command, loaded, loadOlder, loadingOlder, olderFailure, report, state };
}

/** The stream's read-only question, as the command hook receives it. */
export type Ask = ReturnType<typeof useConversationStream>["ask"];
