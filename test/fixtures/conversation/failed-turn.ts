import type { ServerFrame } from "#protocol/conversation/frames";

import { windowSession } from "./frames.ts";

/** A turn whose request fails: a notice, no assistant entry, and the run ends. */
export const failedTurnFrames: ReadonlyArray<ServerFrame> = [
	{ t: "snapshot", ...windowSession("s-failed"), hasOlder: false, notices: [], resync: false },
	{ t: "busy", busy: true },
	{ t: "notice", id: "n1", kind: "error", text: "provider rejected the request (401)" },
	{ t: "busy", busy: false },
	{ t: "drift", reason: "this chat was changed outside Epsilon" },
];
