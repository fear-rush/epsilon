/**
 * One session's transcript in this tab. The socket belongs to the tab (link.ts),
 * so this store holds only what frames reduced to: a remount reuses it instead of
 * rebuilding the transcript from a snapshot, and leaving the route releases it.
 */
import type {
	Command,
	DialogAnswer,
	Place,
	PromptBehavior,
	ServerFrame,
	ThinkingLevel,
} from "shared";
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
	/**
	 * The `!cmd` this tab sent while pi reports it running, so the transient row can
	 * name it. pi's snapshot carries only the flag; another tab's command has no
	 * name here, and the row omits it rather than guessing.
	 */
	bashCommand: string | undefined;
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
	/** One notification per display refresh, however many frames arrive in between. */
	private frame: number | undefined;
	readonly sessionId: string;

	constructor(sessionId: string, place: Place) {
		this.sessionId = sessionId;
		this.snapshot = {
			sessionId,
			status: link.current,
			loaded: false,
			startError: undefined,
			bashCommand: undefined,
			state: emptyConversation,
		};
		this.stopStatus = link.onStatus((status) => this.update({ status }));
		this.stopProblem = link.onProblem((message) =>
			this.update({
				state: reduce(this.snapshot.state, { t: "error", code: "UNSUPPORTED_FRAME", message }),
			}),
		);
		this.detach = link.attach(sessionId, place, (frame) => {
			const state = reduce(this.snapshot.state, frame);
			// The flag is pi's; the command text is only this tab's own send.
			const bashSettled =
				(frame.t === "snapshot" && !frame.snapshot.state.isBashRunning) ||
				(frame.t === "command-result" && frame.command === "bash");
			this.update({
				state,
				bashCommand: bashSettled ? undefined : this.snapshot.bashCommand,
				loaded: this.snapshot.loaded || frame.t === "snapshot",
				startError:
					startErrorOf(frame) ?? (frame.t === "snapshot" ? undefined : this.snapshot.startError),
			});
		});
	}

	/**
	 * Leave this session. The detach starts the server's idle grace, so a quick
	 * return reattaches to the same engine instead of rebuilding it from the file.
	 */
	dispose(): void {
		if (this.frame !== undefined) cancelAnimationFrame(this.frame);
		this.frame = undefined;
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

	/**
	 * Send a message. While a run is active, `behavior` is how it joins that run:
	 * `steer` interrupts it after the current turn's tools, `followUp` waits for it
	 * to settle. pi also dispatches an extension command from a prompt immediately,
	 * which is why the page never uses `steer` itself.
	 */
	prompt(text: string, behavior?: PromptBehavior): void {
		this.sendCommand({ type: "prompt", text, behavior });
	}

	/** Replace this chat's history with a summary, optionally guided by `instructions`. */
	compact(instructions?: string): void {
		this.sendCommand(
			instructions === undefined ? { type: "compact" } : { type: "compact", instructions },
		);
	}

	abortCompaction(): void {
		this.sendCommand({ type: "abort_compaction" });
	}

	cancelRetry(): void {
		this.sendCommand({ type: "cancel_retry" });
	}

	/** pi's global setting, not a switch for this chat: it applies to every chat. */
	setAutoCompaction(enabled: boolean): void {
		this.sendCommand({ type: "set_auto_compaction", enabled });
	}

	/** pi's global setting, not a switch for this chat: it applies to every chat. */
	setAutoRetry(enabled: boolean): void {
		this.sendCommand({ type: "set_auto_retry", enabled });
	}

	abortBash(): void {
		this.sendCommand({ type: "abort_bash" });
	}

	/** Drop every prompt pi holds for the active run; pi exposes no per-item removal. */
	clearQueue(): void {
		this.sendCommand({ type: "clear_queue" });
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
		// The transient running row names the command only while this tab sent it.
		this.update({ bashCommand: command });
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
		this.prompt(`/permission ${mode}`);
	}

	answerDialog(answer: DialogAnswer): void {
		link.send({ t: "dialog", sessionId: this.sessionId, answer });
	}

	private sendCommand(command: Command): void {
		link.send({ t: "command", sessionId: this.sessionId, command });
	}

	private update(change: Partial<ConversationSnapshot>): void {
		this.snapshot = { ...this.snapshot, ...change };
		// Reduce every frame so the state is true, but let React render once per refresh.
		this.frame ??= requestAnimationFrame(() => {
			this.frame = undefined;
			for (const listener of this.listeners) listener();
		});
	}
}
