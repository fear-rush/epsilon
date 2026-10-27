/**
 * The tab's conversation. Holds one Link and the reducer output; no React, so it
 * can be driven and inspected outside a component.
 *
 * The state is only what frames produced. A reconnect resync replaces it in S3;
 * today the frames simply continue.
 */
import type { RpcExtensionUIResponse } from "shared";
import { emptyConversation, reduce } from "shared";
import type { ConversationState } from "shared";

import { Link } from "@/link";
import type { LinkStatus } from "@/link";

export type ConversationSnapshot = {
	sessionId: string;
	status: LinkStatus;
	state: ConversationState;
};

export class ConversationStore {
	private snapshot: ConversationSnapshot;
	private readonly listeners = new Set<() => void>();
	private readonly link: Link;
	readonly sessionId: string;

	constructor(sessionId: string) {
		this.sessionId = sessionId;
		this.snapshot = { sessionId, status: "connecting", state: emptyConversation };
		this.link = new Link({
			onStatus: (status) => this.update({ status }),
			onFrame: (frame) => this.update({ state: reduce(this.snapshot.state, frame) }),
		});
		this.link.attach(sessionId);
	}

	readonly subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	readonly getSnapshot = (): ConversationSnapshot => this.snapshot;

	sendPrompt(message: string): void {
		this.link.send({ t: "rpc", sessionId: this.sessionId, command: { type: "prompt", message } });
	}

	answerDialog(answer: RpcExtensionUIResponse): void {
		this.link.send({ t: "dialog", sessionId: this.sessionId, answer });
	}

	private update(change: Partial<ConversationSnapshot>): void {
		this.snapshot = { ...this.snapshot, ...change };
		for (const listener of this.listeners) listener();
	}
}
