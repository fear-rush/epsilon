/**
 * Pinned chat ids are Epsilon's own preference, not pi state. pi has no pin
 * concept, so one small private file in the agent home holds them and the list
 * route joins it to pi's sessions. Unknown keys survive, like every other file.
 */
import { z } from "zod";

import type { AgentHome } from "../../platform/agent-home";
import { jsonDocument } from "../../platform/json-document";

const pinsSchema = z.looseObject({ sessions: z.array(z.string()) });

type Pins = z.infer<typeof pinsSchema>;

const document = (home: AgentHome) =>
	jsonDocument(home.pinsFile, {
		schema: pinsSchema,
		empty: (): Pins => ({ sessions: [] }),
		policy: "private",
		wording: {
			problem: (cause, path) => `Pinned chats could not be read (${cause}) from ${path}.`,
			refusal: (path, problem) => `Epsilon did not write pinned chats because ${path} ${problem}.`,
		},
	});

export type PinnedState = { ids: ReadonlySet<string>; problem: string | undefined };

/** One tolerant read for the list route. A broken file is an empty set plus why. */
export const readPinned = async (home: AgentHome): Promise<PinnedState> => {
	const { value, problem } = await document(home).read();
	return { ids: new Set(value.sessions), problem };
};

/** Add or remove one id, keeping every pin the file already holds. */
export const writePinned = async (home: AgentHome, id: string, pinned: boolean): Promise<void> => {
	await document(home).update((current) => {
		const sessions = new Set(current.sessions);
		if (pinned) sessions.add(id);
		else sessions.delete(id);
		return { ...current, sessions: [...sessions] };
	});
};
