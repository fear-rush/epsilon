/**
 * Removing one session file. pi has no delete: this is our own disk operation, so
 * it resolves the id through pi's own lookup and refuses while a child is live.
 * The browser never sends a path.
 */
import { rm } from "node:fs/promises";

import type { SessionErrorCode } from "shared";

import { findSessionFile } from "../agent/sessions";

export type DeleteOutcome =
	| { removed: true }
	| { removed: false; code: SessionErrorCode; message: string };

export async function deleteSession(
	projectDir: string,
	id: string,
	isRunning: boolean,
): Promise<DeleteOutcome> {
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
}
