import { performance } from "node:perf_hooks";

import { reduce } from "../../src/domain/conversation/reduce.ts";
import { emptyConversation } from "../../src/domain/conversation/state.ts";
import type { TranscriptEntry } from "../../src/protocol/conversation/frames.ts";
import { report } from "./lib.ts";

/**
 * A 20 KB streamed reply in a 2,000-row chat: no single frame's reduce may take longer
 * than the budget, because each one runs inside a paint on the page.
 *
 * The frames are the reducer's own vocabulary, built here rather than replayed, so the
 * measurement is the reduce alone: the transcript's render is React's and is covered by
 * the render budget in `open-window.ts`.
 */
const rows = 2_000;
const replyBytes = 20 * 1024;
const deltaBytes = 100;

const entries: TranscriptEntry[] = [];
for (let index = 0; index < rows; index++) {
	const id = `e${String(index).padStart(6, "0")}`;
	const parentId = index === 0 ? null : `e${String(index - 1).padStart(6, "0")}`;
	entries.push(
		index % 2 === 0
			? { id, parentId, role: "user", text: `prompt ${index}`, images: [], ts: index }
			: {
					id,
					parentId,
					role: "assistant",
					blocks: [{ type: "text", text: `answer ${index}` }],
					ts: index,
				},
	);
}

let state = reduce(emptyConversation, {
	t: "snapshot",
	sessionId: "bench",
	entries,
	hasOlder: false,
	notices: [],
});

const delta = "x".repeat(deltaBytes);
const frames = Math.ceil(replyBytes / deltaBytes);
let slowest = 0;
for (let index = 0; index < frames; index++) {
	const started = performance.now();
	state = reduce(state, {
		t: "streaming",
		streamId: "bench-stream",
		blockIndex: 0,
		kind: "text",
		delta,
	});
	slowest = Math.max(slowest, performance.now() - started);
}
if (state.streaming.length === 0) throw new Error("client-stream: the stream was not kept");

await report("client-stream", "ms", slowest);
