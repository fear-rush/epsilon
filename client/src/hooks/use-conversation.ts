import { useEffect, useSyncExternalStore } from "react";

import { ConversationStore } from "@/conversation/store";

/**
 * One store per session per tab, held outside React: a remount reuses the reduced
 * transcript instead of showing an empty page until the next snapshot. The socket
 * is not held here; `link.ts` owns the tab's one socket.
 *
 * A store releases itself when the route leaves, after the current tick. React
 * StrictMode mounts, unmounts and mounts again in one tick, so the second mount
 * cancels the release and the server's idle grace keeps the engine alive.
 */
type Entry = { store: ConversationStore; release: ReturnType<typeof setTimeout> | undefined };

const stores = new Map<string, Entry>();

const storeFor = (sessionId: string): ConversationStore => {
	const existing = stores.get(sessionId);
	if (existing !== undefined) {
		if (existing.release !== undefined) clearTimeout(existing.release);
		existing.release = undefined;
		return existing.store;
	}
	const store = new ConversationStore(sessionId);
	stores.set(sessionId, { store, release: undefined });
	return store;
};

const release = (sessionId: string): void => {
	const entry = stores.get(sessionId);
	if (entry === undefined) return;
	entry.release = setTimeout(() => {
		if (stores.get(sessionId) !== entry) return;
		stores.delete(sessionId);
		entry.store.dispose();
	}, 0);
};

/**
 * A session id is always known (the list generates one for a new session), so a
 * page load can never mint a session by accident. Only the explicit "New session"
 * does, and pi writes its file on the first message.
 */
export function useConversation(sessionId: string) {
	const store = storeFor(sessionId);
	useEffect(() => {
		const entry = stores.get(sessionId);
		if (entry?.release !== undefined) {
			clearTimeout(entry.release);
			entry.release = undefined;
		}
		return () => release(sessionId);
	}, [sessionId]);
	const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
	return { store, snapshot };
}
