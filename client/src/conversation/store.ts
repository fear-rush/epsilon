/**
 * One session's transcript in this tab. The socket belongs to the tab (link.ts),
 * so this store holds only what frames reduced to: a remount reuses it instead of
 * rebuilding the transcript from a snapshot.
 */
import type { RpcExtensionUIResponse } from "shared";
import { emptyConversation, reduce } from "shared";
import type { ConversationState } from "shared";

import { link } from "@/link";
import type { LinkStatus } from "@/link";

export type ConversationSnapshot = {
	sessionId: string;
	status: LinkStatus;
	/** True once a snapshot arrived, so the page can show a loader until then. */
	loaded: boolean;
	state: ConversationState;
};

export class ConversationStore {
	private snapshot: ConversationSnapshot;
	private readonly listeners = new Set<() => void>();
	readonly sessionId: string;

	constructor(sessionId: string) {
		this.sessionId = sessionId;
		this.snapshot = { sessionId, status: link.current, loaded: false, state: emptyConversation };
		link.onStatus((status) => this.update({ status }));
		link.attach(sessionId, (frame) =>
			this.update({
				state: reduce(this.snapshot.state, frame),
				loaded: this.snapshot.loaded || frame.t === "snapshot",
			}),
		);
	}

	readonly subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	readonly getSnapshot = (): ConversationSnapshot => this.snapshot;

	sendPrompt(message: string): void {
		link.send({ t: "rpc", sessionId: this.sessionId, command: { type: "prompt", message } });
	}

	/** Interrupt the running turn with this message instead of waiting for it. */
	steer(message: string): void {
		link.send({ t: "rpc", sessionId: this.sessionId, command: { type: "steer", message } });
	}

	abort(): void {
		link.send({ t: "rpc", sessionId: this.sessionId, command: { type: "abort" } });
	}

	/** pi answers with a fresh snapshot, so the menu shows the model it chose. */
	setModel(provider: string, modelId: string): void {
		link.send({
			t: "rpc",
			sessionId: this.sessionId,
			command: { type: "set_model", provider, modelId },
		});
	}

	/**
	 * `/permission` is the extension's own command, and pi dispatches an extension
	 * command from a prompt without starting a turn. Verified over the socket: the
	 * reply is ok, no agent event runs, and the extension sends a new `setStatus`.
	 */
	setPermission(mode: string): void {
		link.send({
			t: "rpc",
			sessionId: this.sessionId,
			command: { type: "prompt", message: `/permission ${mode}` },
		});
	}

	answerDialog(answer: RpcExtensionUIResponse): void {
		link.send({ t: "dialog", sessionId: this.sessionId, answer });
	}

	private update(change: Partial<ConversationSnapshot>): void {
		this.snapshot = { ...this.snapshot, ...change };
		for (const listener of this.listeners) listener();
	}
}
