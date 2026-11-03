import type { ServerFrame } from "#protocol/conversation/frames";

import { windowSession } from "./frames.ts";

/** A single read tool run, with no streamed text: the row is the tool card. */
export const toolTurnFrames: ReadonlyArray<ServerFrame> = [
	{ t: "snapshot", ...windowSession("s-tool"), hasOlder: false, notices: [], resync: false },
	{ t: "busy", busy: true },
	{
		t: "append",
		entry: {
			role: "assistant",
			id: "a1",
			parentId: "u1",
			ts: 2_000,
			blocks: [
				{ type: "toolCall", toolCallId: "call-9", toolName: "read", args: { path: "AGENTS.md" } },
			],
		},
	},
	{
		t: "toolDelta",
		toolCallId: "call-9",
		entryId: "a1",
		toolName: "read",
		status: "ok",
		output: "# epsilon",
		durationMs: 3,
	},
	{ t: "busy", busy: false },
];
