import type { ServerFrame } from "#protocol/conversation/frames";

/** The part of a snapshot that a fixture window always provides. */
export type SnapshotWindow = Pick<Extract<ServerFrame, { t: "snapshot" }>, "sessionId" | "entries">;

export const windowSession = (sessionId: string): SnapshotWindow => ({
	sessionId,
	entries: [
		{ id: "u1", parentId: null, role: "user", ts: 1_000, text: "run the tests", images: [] },
	],
});
