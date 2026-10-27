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
import type { DialogQuestion, ServerFrame, Snapshot } from "shared";
import { z } from "zod";

import { Driver } from "./driver";
import type { AgentFrame, ExitInfo } from "./driver";

/** A socket, or anything else that wants this session's frames. */
export type FrameSink = (frame: ServerFrame) => void;

/**
 * The two reads a snapshot needs, unwrapped from their RPC envelopes. pi owns the
 * inner shapes; the transcript stores them as they arrive.
 */
const repliesSchema = z.tuple([
	z.looseObject({ data: z.custom<Snapshot["state"]>() }),
	z.looseObject({
		data: z.looseObject({ messages: z.array(z.custom<Snapshot["messages"][number]>()) }),
	}),
]);

const QUESTION_METHODS = ["select", "confirm", "input", "editor"];

const isQuestion = (request: RpcExtensionUIRequest): request is DialogQuestion =>
	QUESTION_METHODS.includes(request.method);

export class AgentSession {
	readonly sessionId: string;
	private readonly driver: Driver;
	private readonly subscribers = new Set<FrameSink>();
	private readonly pendingDialogs = new Map<string, DialogQuestion>();
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
		this.sendMetaTo(sink);
		void this.sendSnapshot(sink);
		return () => this.subscribers.delete(sink);
	}

	/** History comes from pi's session file, never from server memory. */
	private async sendSnapshot(sink: FrameSink): Promise<void> {
		try {
			const [state, messages] = await Promise.all([
				this.driver.request({ type: "get_state" }),
				this.driver.request({ type: "get_messages" }),
			]);
			const replies = repliesSchema.safeParse([state, messages]);
			if (!replies.success) {
				this.emit({
					t: "error",
					code: "UNSUPPORTED_FRAME",
					message: "Unreadable snapshot",
					sessionId: this.sessionId,
				});
				return;
			}
			const [sessionState, sessionMessages] = replies.data;
			sink({
				t: "snapshot",
				sessionId: this.sessionId,
				snapshot: {
					state: sessionState.data,
					messages: sessionMessages.data.messages.filter(isVisibleMessage),
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
				// Only these four ask and wait. notify/setStatus/setWidget/setTitle/
				// set_editor_text are fire-and-forget; treating them as pending would
				// leave needsInput stuck true from the first millisecond.
				if (!isQuestion(frame)) return;
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
				return;
			default:
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
