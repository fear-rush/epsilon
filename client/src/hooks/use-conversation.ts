import { useEffect, useState, useSyncExternalStore } from "react";

import { ConversationStore } from "@/conversation/store";

/**
 * One store per page instance: it owns the socket for as long as the page lives.
 * Without a session id the page opens a new session, which is what S2 can do
 * before the session list exists.
 */
export function useConversation(sessionId?: string) {
	const [store] = useState(() => new ConversationStore(sessionId ?? crypto.randomUUID()));
	useEffect(() => () => store.close(), [store]);
	const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
	return { store, snapshot };
}
