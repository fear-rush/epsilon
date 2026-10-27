/**
 * The one place that asks pi about session files. pi's `SessionInfo` carries
 * `allMessagesText`, which is every message ever written; the list never needs
 * it, so only the summary fields leave this module.
 */
import { SessionManager } from "@earendil-works/pi-coding-agent";

export type StoredSession = {
	id: string;
	cwd: string;
	name?: string;
	created: string;
	modified: string;
	messageCount: number;
	firstMessage: string;
};

/** Sessions pi recorded for this project, in pi's order. Newest sort is the caller's. */
export async function listStoredSessions(projectDir: string): Promise<StoredSession[]> {
	const sessions = await SessionManager.list(projectDir);
	return sessions.map((session) => ({
		id: session.id,
		cwd: session.cwd,
		name: session.name,
		created: session.created.toISOString(),
		modified: session.modified.toISOString(),
		messageCount: session.messageCount,
		firstMessage: session.firstMessage,
	}));
}

/**
 * The file for one id, or undefined when this project has no such session. A
 * delete must resolve through this, never through a path the browser sent.
 */
export function findSessionFile(projectDir: string, id: string): string | undefined {
	return SessionManager.findById(projectDir, id);
}
