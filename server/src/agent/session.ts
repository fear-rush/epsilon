/**
 * One attached pi session: the child plus the state the browser cannot rebuild
 * by itself. The transcript is never kept here; it lives in pi's session file.
 * Two things are: unanswered dialogs, and whether the child is running.
 */
import type {
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
} from "@earendil-works/pi-coding-agent";
import { isVisibleMessage } from "shared";
import type { DialogQuestion, ExtensionDisplay, ServerFrame, Snapshot } from "shared";
import { z } from "zod";

import { Driver } from "./driver";
import type { AgentFrame, ExitInfo } from "./driver";

/** A socket, or anything else that wants this session's frames. */
export type FrameSink = (frame: ServerFrame) => void;

/**
 * The two reads a snapshot needs, unwrapped from their RPC envelopes. pi owns the
 * inner shapes; the transcript stores them as they arrive.
 */
const modelSchema = z.looseObject({ provider: z.string(), id: z.string(), name: z.string() });

const repliesSchema = z.tuple([
	z.looseObject({ data: z.custom<Snapshot["state"]>() }),
	z.looseObject({
		data: z.looseObject({ messages: z.array(z.custom<Snapshot["messages"][number]>()) }),
	}),
	z.looseObject({ data: z.looseObject({ models: z.array(modelSchema) }) }),
]);

const QUESTION_METHODS = ["select", "confirm", "input", "editor"];

/** The two methods that carry state across attaches, and how to key them. */
const displayKey = (request: ExtensionDisplay): string | undefined => {
	if (request.method === "setStatus") return `status:${request.statusKey}`;
	if (request.method === "setWidget") return `widget:${request.widgetKey}`;
	return undefined;
};

const isCleared = (request: ExtensionDisplay): boolean =>
	(request.method === "setStatus" && request.statusText === undefined) ||
	(request.method === "setWidget" && request.widgetLines === undefined);

const isQuestion = (request: RpcExtensionUIRequest): request is DialogQuestion =>
	QUESTION_METHODS.includes(request.method);

export class AgentSession {
	readonly sessionId: string;
	private readonly driver: Driver;
	private readonly subscribers = new Set<FrameSink>();
	private readonly pendingDialogs = new Map<string, DialogQuestion>();
	/**
	 * Keyed display state an extension set and has not cleared, so a tab that
	 * attaches later sees the current status and widgets instead of nothing.
	 */
	private readonly displayState = new Map<string, ExtensionDisplay>();
	/**
	 * True when a `!cmd` ran and pi may still be holding its message. pi appends the
	 * message at once while idle, but only after the turn when a run was streaming
	 * (`recordBashResult` in pi's `agent-session`), so the settle re-reads once more.
	 */
	private bashUnsettled = false;
	/** pi's own busy flag, mirrored only to decide whether a bash message is held. */
	private streaming = false;
	private running = false;

	constructor(sessionId: string, cwd: string) {
		this.sessionId = sessionId;
		this.running = true;
		this.driver = new Driver({
			session: { kind: "id", id: sessionId },
			cwd,
			onFrame: (frame) => this.receive(frame),
			onExit: (info) => this.exited(info),
		});
		this.sendMeta();
	}

	get isRunning(): boolean {
		return this.running;
	}

	/**
	 * A late subscriber gets the meta and every unanswered dialog, so a dialog
	 * that blocks the agent is never invisible (docs/protocol.md).
	 */
	subscribe(sink: FrameSink): () => void {
		this.subscribers.add(sink);
		for (const request of this.pendingDialogs.values()) {
			sink({ t: "dialog", sessionId: this.sessionId, request });
		}
		for (const request of this.displayState.values()) {
			sink({ t: "ui", sessionId: this.sessionId, request });
		}
		this.sendMetaTo(sink);
		void this.sendSnapshot(sink);
		return () => this.subscribers.delete(sink);
	}

	/**
	 * Forward a display-only request, remembering the keyed ones. `setStatus` and
	 * `setWidget` clear themselves by sending an undefined value.
	 */
	private show(request: ExtensionDisplay): void {
		const key = displayKey(request);
		if (key !== undefined) {
			if (isCleared(request)) this.displayState.delete(key);
			else this.displayState.set(key, request);
		}
		this.emit({ t: "ui", sessionId: this.sessionId, request });
	}

	/** History comes from pi's session file, never from server memory. */
	private async sendSnapshot(sink: FrameSink): Promise<void> {
		try {
			const [state, messages, models] = await Promise.all([
				this.driver.request({ type: "get_state" }),
				this.driver.request({ type: "get_messages" }),
				this.driver.request({ type: "get_available_models" }),
			]);
			const replies = repliesSchema.safeParse([state, messages, models]);
			if (!replies.success) {
				this.emit({
					t: "error",
					code: "UNSUPPORTED_FRAME",
					message: "Unreadable snapshot",
					sessionId: this.sessionId,
				});
				return;
			}
			const [sessionState, sessionMessages, sessionModels] = replies.data;
			sink({
				t: "snapshot",
				sessionId: this.sessionId,
				snapshot: {
					state: sessionState.data,
					messages: sessionMessages.data.messages.filter(isVisibleMessage),
					models: sessionModels.data.models.map((model) => ({
						provider: model.provider,
						id: model.id,
						name: model.name,
					})),
				},
			});
		} catch (error) {
			sink({
				t: "error",
				code: "AGENT_START_FAILED",
				message: error instanceof Error ? error.message : "The agent did not answer",
				sessionId: this.sessionId,
			});
		}
	}

	/** Re-read the snapshot for everyone watching, after pi changed its state. */
	private resync(): void {
		for (const sink of this.subscribers) void this.sendSnapshot(sink);
	}

	get dialogs(): DialogQuestion[] {
		return [...this.pendingDialogs.values()];
	}

	get needsInput(): boolean {
		return this.pendingDialogs.size > 0;
	}

	send(command: RpcCommand): void {
		this.driver.send(command);
	}

	/** Answer one dialog. The first answer wins; a repeat is ignored. */
	answerDialog(answer: RpcExtensionUIResponse): boolean {
		if (!this.pendingDialogs.delete(answer.id)) return false;
		this.driver.send(answer);
		this.emit({ t: "dialog-closed", sessionId: this.sessionId, id: answer.id });
		this.sendMeta();
		return true;
	}

	kill(): void {
		this.driver.kill();
	}

	private receive(frame: AgentFrame): void {
		switch (frame.type) {
			case "extension_ui_request":
				// Only these four ask and wait. The other five display something and
				// never block, so they must not enter pendingDialogs: that would leave
				// needsInput stuck true from the first millisecond.
				if (!isQuestion(frame)) {
					this.show(frame);
					return;
				}
				this.pendingDialogs.set(frame.id, frame);
				this.emit({ t: "dialog", sessionId: this.sessionId, request: frame });
				this.sendMeta();
				return;
			case "response":
				this.emit({
					t: "rpc-result",
					sessionId: this.sessionId,
					id: frame.id,
					ok: frame.success,
					error: frame.success ? undefined : frame.error,
				});
				// The chosen model lives in pi, so read it back instead of echoing the
				// request: the picker shows pi's answer, not the browser's guess.
				if (frame.success && frame.command === "set_model") this.resync();
				// A shell run is a message in pi's session file and never an agent event,
				// so without this read the card would only appear on the next attach.
				if (frame.success && frame.command === "bash") {
					if (this.streaming) this.bashUnsettled = true;
					this.resync();
				}
				return;
			default:
				if (frame.type === "agent_start") this.streaming = true;
				// pi flushes a bash message held during a run just before it settles.
				if (frame.type === "agent_settled") {
					this.streaming = false;
					if (this.bashUnsettled) {
						this.bashUnsettled = false;
						this.resync();
					}
				}
				this.emit({ t: "event", sessionId: this.sessionId, event: frame });
		}
	}

	private exited(info: ExitInfo): void {
		this.running = false;
		if (!info.requested) {
			const cause = info.signal === null ? `code ${info.code ?? "unknown"}` : info.signal;
			const stderr = info.stderr === "" ? "" : ` stderr: ${info.stderr}`;
			this.emit({
				t: "error",
				code: "CHILD_EXITED",
				message: `The agent exited (${cause}).${stderr}`,
				sessionId: this.sessionId,
			});
		}
		this.sendMeta();
	}

	private sendMeta(): void {
		for (const sink of this.subscribers) this.sendMetaTo(sink);
	}

	private sendMetaTo(sink: FrameSink): void {
		sink({
			t: "meta",
			sessionId: this.sessionId,
			running: this.running,
			needsInput: this.needsInput,
		});
	}

	private emit(frame: ServerFrame): void {
		for (const sink of this.subscribers) sink(frame);
	}
}
