import { useSyncExternalStore } from "react";

import { ConversationStore } from "@/conversation/store";

/**
 * One store per session per tab, held outside React. StrictMode runs a state
 * initializer twice and discards one result, so a store created per mount leaves
 * a closed socket behind the one the page renders: the transcript stays empty and
 * the header stays on "connecting" while the server sends a full snapshot.
 */
const stores = new Map<string, ConversationStore>();

/** One fresh session per page load, so a second mount reuses the same id. */
const freshSessionId = crypto.randomUUID();

const storeFor = (sessionId: string): ConversationStore => {
	const existing = stores.get(sessionId);
	if (existing !== undefined) return existing;
	const store = new ConversationStore(sessionId);
	stores.set(sessionId, store);
	return store;
};

/**
 * Without a session id the page opens a new session, which is what S2 can do
 * before the session list exists.
 */
export function useConversation(sessionId?: string) {
	const store = storeFor(sessionId ?? freshSessionId);
	const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
	return { store, snapshot };
}
