/**
 * A draft handed to the next composer for a session: the new chat a fork opens,
 * or the same chat after a move in its tree remounts the composer. The composer
 * reads it when it mounts and clears it after.
 */
const drafts = new Map<string, string>();

/** Keep `text` for the composer of `sessionId`; an empty text has nothing to hand over. */
export const setPendingDraft = (sessionId: string, text: string): void => {
	if (text.trim() === "") return;
	drafts.set(sessionId, text);
};

export const pendingDraftOf = (sessionId: string): string => drafts.get(sessionId) ?? "";

export const clearPendingDraft = (sessionId: string): void => {
	drafts.delete(sessionId);
};
