/**
 * Text the engine handed back for a chat that is not the one on screen yet.
 *
 * A fork writes a new session file, and the text pi selected belongs to that new chat.
 * The page moves to the new id a frame later; this carries the text across the route
 * change so the composer opens with the message the operator may send next.
 */
let handoff: { readonly sessionId: string; readonly text: string } | undefined;

export const handOffDraft = (sessionId: string, text: string): void => {
	handoff = { sessionId, text };
};

export const takeHandedOffDraft = (sessionId: string): string | undefined => {
	if (handoff === undefined || handoff.sessionId !== sessionId) return undefined;
	const text = handoff.text;
	handoff = undefined;
	return text;
};
