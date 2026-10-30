/**
 * Session files joined with the live state that only this server knows. pi knows
 * a session exists; only the registry knows an engine holds it and whether it
 * waits for an answer. Removing a file is our own disk operation (pi has no
 * delete): it resolves the id through pi's own lookup and refuses while a live
 * engine holds it. The browser never sends a path.
 */
import { rm } from "node:fs/promises";

import { findSessionFile } from "../../platform/pi";
import type { StoredSession } from "../../platform/pi";
import type { SessionErrorCode, SessionSummary } from "./contract";

export const joinSessions = (
	stored: StoredSession[],
	live: { id: string; needsInput: boolean }[],
): SessionSummary[] => {
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
};

export type DeleteOutcome =
	| { removed: true }
	| { removed: false; code: SessionErrorCode; message: string };

export const deleteSession = async (
	projectDir: string,
	id: string,
	isRunning: boolean,
): Promise<DeleteOutcome> => {
	if (isRunning) {
		return {
			removed: false,
			code: "SESSION_RUNNING",
			message: "A live agent still holds this session. Stop it before deleting.",
		};
	}
	const file = findSessionFile(projectDir, id);
	if (file === undefined) {
		return {
			removed: false,
			code: "SESSION_NOT_FOUND",
			message: "This project has no such session.",
		};
	}
	// `force` makes a second delete of the same id succeed: the file is already gone.
	await rm(file, { force: true });
	return { removed: true };
};
