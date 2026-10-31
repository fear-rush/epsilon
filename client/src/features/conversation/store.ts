/**
 * One session's transcript in this tab. The socket belongs to the tab (link.ts),
 * so this store holds only what frames reduced to: a remount reuses it instead of
 * rebuilding the transcript from a snapshot, and leaving the route releases it.
 */
import type { Command, DialogAnswer, Place, ServerFrame, ThinkingLevel } from "shared";
import { emptyConversation, reduce } from "shared";
import type { ConversationState } from "shared";

import { link } from "@/socket/link";
import type { LinkStatus } from "@/socket/link";

export type ConversationSnapshot = {
	sessionId: string;
	status: LinkStatus;
	/** True once a snapshot arrived, so the page can show a loader until then. */
	loaded: boolean;
	/** Why the engine did not start, so the loader can say so instead of spinning. */
	startError: string | undefined;
	state: ConversationState;
};

/** An engine that could not start sends one error frame and no snapshot. */
const startErrorOf = (frame: ServerFrame): string | undefined =>
	frame.t === "error" &&
	(frame.code === "AGENT_START_FAILED" || frame.code === "PROJECT_NOT_TRUSTED")
		? frame.message
		: undefined;

export class ConversationStore {
	private snapshot: ConversationSnapshot;
	private readonly listeners = new Set<() => void>();
	private readonly detach: () => void;
	private readonly stopStatus: () => void;
	private readonly stopProblem: () => void;
	readonly sessionId: string;

	constructor(sessionId: string, place: Place) {
		this.sessionId = sessionId;
		this.snapshot = {
			sessionId,
			status: link.current,
			loaded: false,
			startError: undefined,
			state: emptyConversation,
		};
		this.stopStatus = link.onStatus((status) => this.update({ status }));
		this.stopProblem = link.onProblem((message) =>
			this.update({
				state: reduce(this.snapshot.state, { t: "error", code: "UNSUPPORTED_FRAME", message }),
			}),
		);
		this.detach = link.attach(sessionId, place, (frame) =>
			this.update({
				state: reduce(this.snapshot.state, frame),
				loaded: this.snapshot.loaded || frame.t === "snapshot",
				startError:
					startErrorOf(frame) ?? (frame.t === "snapshot" ? undefined : this.snapshot.startError),
			}),
		);
	}

	/**
	 * Leave this session. The detach starts the server's idle grace, so a quick
	 * return reattaches to the same engine instead of rebuilding it from the file.
	 */
	dispose(): void {
		this.detach();
		this.stopStatus();
		this.stopProblem();
		this.listeners.clear();
	}

	readonly subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	readonly getSnapshot = (): ConversationSnapshot => this.snapshot;

	sendPrompt(text: string): void {
		this.sendCommand({ type: "prompt", text });
	}

	/** Interrupt the running turn with this message instead of waiting for it. */
	steer(text: string): void {
		this.sendCommand({ type: "steer", text });
	}

	abort(): void {
		this.sendCommand({ type: "abort" });
	}

	/** Re-read extensions, skills and packages without replacing the session. */
	reload(): void {
		this.sendCommand({ type: "reload" });
	}

	/**
	 * `!cmd` runs in the shell. `!!cmd` is the same run with its output kept out of
	 * the agent's context, which is why the flag travels with the command.
	 */
	runBash(command: string, excludeFromContext: boolean): void {
		this.sendCommand({ type: "bash", command, excludeFromContext });
	}

	/** pi answers with a fresh snapshot, so the menu shows the model it chose. */
	setModel(provider: string, modelId: string): void {
		this.sendCommand({ type: "set_model", provider, modelId });
	}

	/**
	 * Turn the tools that run commands and change files on or off. pi records the
	 * tool set in the transcript on the next turn and restores it on reopen.
	 */
	setCodingTools(enabled: boolean): void {
		this.sendCommand({ type: "set_coding_tools", enabled });
	}

	/** Session-only, like pi's /thinking. pi records the change in the transcript. */
	setThinkingLevel(level: ThinkingLevel): void {
		this.sendCommand({ type: "set_thinking_level", level });
	}

	/**
	 * `/permission` is the extension's own command, and pi dispatches an extension
	 * command from a prompt without starting a turn. Verified over the socket: the
	 * reply is ok, no agent event runs, and the extension sends a new `setStatus`.
	 */
	setPermission(mode: string): void {
		this.sendCommand({ type: "prompt", text: `/permission ${mode}` });
	}

	answerDialog(answer: DialogAnswer): void {
		link.send({ t: "dialog", sessionId: this.sessionId, answer });
	}

	private sendCommand(command: Command): void {
		link.send({ t: "command", sessionId: this.sessionId, command });
	}

	private update(change: Partial<ConversationSnapshot>): void {
		this.snapshot = { ...this.snapshot, ...change };
		for (const listener of this.listeners) listener();
	}
}
