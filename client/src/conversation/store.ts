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
	state: ConversationState;
};

export class ConversationStore {
	private snapshot: ConversationSnapshot;
	private readonly listeners = new Set<() => void>();
	readonly sessionId: string;

	constructor(sessionId: string) {
		this.sessionId = sessionId;
		this.snapshot = { sessionId, status: link.current, state: emptyConversation };
		link.onStatus((status) => this.update({ status }));
		link.attach(sessionId, (frame) => this.update({ state: reduce(this.snapshot.state, frame) }));
	}

	readonly subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	readonly getSnapshot = (): ConversationSnapshot => this.snapshot;

	sendPrompt(message: string): void {
		link.send({ t: "rpc", sessionId: this.sessionId, command: { type: "prompt", message } });
	}

	answerDialog(answer: RpcExtensionUIResponse): void {
		link.send({ t: "dialog", sessionId: this.sessionId, answer });
	}

	private update(change: Partial<ConversationSnapshot>): void {
		this.snapshot = { ...this.snapshot, ...change };
		for (const listener of this.listeners) listener();
	}
}
