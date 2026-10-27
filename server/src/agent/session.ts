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
import type { DialogQuestion, ServerFrame } from "shared";

import { Driver } from "./driver";
import type { AgentFrame, ExitInfo } from "./driver";

/** A socket, or anything else that wants this session's frames. */
export type FrameSink = (frame: ServerFrame) => void;

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
		return () => this.subscribers.delete(sink);
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
