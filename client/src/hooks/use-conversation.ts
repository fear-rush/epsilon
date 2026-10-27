import { useSyncExternalStore } from "react";

import { ConversationStore } from "@/conversation/store";

/**
 * One store per session per tab, held outside React: a remount reuses the reduced
 * transcript instead of showing an empty page until the next snapshot. The socket
 * is not held here; `link.ts` owns the tab's one socket.
 */
const stores = new Map<string, ConversationStore>();

const storeFor = (sessionId: string): ConversationStore => {
	const existing = stores.get(sessionId);
	if (existing !== undefined) return existing;
	const store = new ConversationStore(sessionId);
	stores.set(sessionId, store);
	return store;
};

/**
 * A session id is always known (the list generates one for a new session), so a
 * page load can never mint a session by accident. Only the explicit "New session"
 * does, and pi writes its file on the first message.
 */
export function useConversation(sessionId: string) {
	const store = storeFor(sessionId);
	const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
	return { store, snapshot };
}
