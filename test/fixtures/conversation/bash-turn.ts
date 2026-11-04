import type { ServerFrame } from "#protocol/conversation/frames";

import { windowSession } from "./frames.ts";

/** A turn that runs `ls`, streams its output and finishes with a sentence. */
export const bashTurnFrames: ReadonlyArray<ServerFrame> = [
	{ t: "snapshot", ...windowSession("s-bash"), hasOlder: false, notices: [], resync: false },
	{ t: "busy", busy: true },
	{ t: "streaming", streamId: "stream-1", blockIndex: 0, kind: "text", delta: "Running " },
	{ t: "streaming", streamId: "stream-1", blockIndex: 0, kind: "text", delta: "`ls`." },
	{
		t: "append",
		streamId: "stream-1",
		entry: {
			role: "assistant",
			id: "a1",
			parentId: "u1",
			ts: 2_000,
			blocks: [
				{ type: "text", text: "Running `ls`." },
				{ type: "toolCall", toolCallId: "call-1", toolName: "bash", args: { command: "ls" } },
			],
		},
	},
	{
		t: "toolDelta",
		toolCallId: "call-1",
		entryId: "a1",
		toolName: "bash",
		status: "running",
		output: "AGENTS.md\n",
	},
	{
		t: "toolDelta",
		toolCallId: "call-1",
		entryId: "a1",
		toolName: "bash",
		status: "ok",
		output: "AGENTS.md\nREADME.md\n",
		durationMs: 41,
	},
	{
		t: "append",
		entry: {
			role: "toolResult",
			id: "t1",
			parentId: "a1",
			ts: 3_000,
			toolCallId: "call-1",
			toolName: "bash",
			isError: false,
			output: "AGENTS.md\nREADME.md\n",
			images: [],
		},
	},
	{
		t: "append",
		entry: {
			role: "assistant",
			id: "a2",
			parentId: "t1",
			ts: 4_000,
			blocks: [{ type: "text", text: "Two files." }],
		},
	},
	{ t: "busy", busy: false },
];
