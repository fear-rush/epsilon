import { useQuery } from "@tanstack/react-query";

import { sessionKeys } from "@/api/keys";
import { fetchSessions } from "@/api/endpoints";
import type { SessionList, SessionSummary } from "@/api/types";

/** One session from the shared list, whether it is a chat or a project's chat. */
export const useSessionRow = (sessionId: string): SessionSummary | undefined => {
	const sessions = useQuery({
		queryKey: sessionKeys.all,
		queryFn: ({ signal }) => fetchSessions(signal),
	});
	return findSession(sessions.data, sessionId);
};

const findSession = (
	list: SessionList | undefined,
	sessionId: string,
): SessionSummary | undefined => {
	if (list === undefined) return undefined;
	const chat = list.chats.find((session) => session.id === sessionId);
	if (chat !== undefined) return chat;
	for (const project of list.projects) {
		const found = project.sessions.find((session) => session.id === sessionId);
		if (found !== undefined) return found;
	}
	return undefined;
};
