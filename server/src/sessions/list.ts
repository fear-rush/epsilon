/**
 * Session files joined with the live state that only this server knows. pi knows
 * a session exists; only the registry knows an engine holds it and whether it
 * waits for an answer.
 */
import type { SessionSummary } from "shared";

import type { StoredSession } from "../agent/sessions";

export function joinSessions(
	stored: StoredSession[],
	live: { id: string; needsInput: boolean }[],
): SessionSummary[] {
	const byId = new Map(live.map((session) => [session.id, session]));
	return stored
		.map((session) => {
			const running = byId.get(session.id);
			return {
				...session,
				running: running !== undefined,
				needsInput: running?.needsInput ?? false,
			};
		})
		.sort((a, b) => b.modified.localeCompare(a.modified));
}
