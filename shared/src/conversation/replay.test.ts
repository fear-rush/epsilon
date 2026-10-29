/**
 * The reducer is replayed from recorded traces, so ordering bugs surface without
 * a browser. Each fixture also has to pass the socket schema, which is the same
 * check a browser does on a frame.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { serverFrameSchema } from "../protocol/frames";
import { reduce } from "./reduce";
import { transcript } from "./selectors";
import { emptyConversation } from "./state";
import type { ConversationState } from "./state";

const FIXTURES = join(import.meta.dirname, "fixtures");
const sessionId = "fixture";

/** A `.jsonl` file is an event log; a `.json` file is one frame, such as a snapshot. */
const replay = (path: string): ConversationState => {
	if (path.endsWith(".json")) {
		return reduce(
			emptyConversation,
			serverFrameSchema.parse(JSON.parse(readFileSync(path, "utf8"))),
		);
	}
	let state = emptyConversation;
	for (const line of readFileSync(path, "utf8").trim().split("\n")) {
		state = reduce(
			state,
			serverFrameSchema.parse({ t: "event", sessionId, event: JSON.parse(line) }),
		);
	}
	return state;
};

const files = readdirSync(FIXTURES).filter(
	(name) => name.endsWith(".jsonl") || name.endsWith(".json"),
);

describe("fixture replay", () => {
	for (const name of files) {
		test(`${name} replays to the same state and renders rows`, () => {
			const path = join(FIXTURES, name);
			const first = replay(path);
			expect(JSON.stringify(replay(path))).toBe(JSON.stringify(first));
			expect(transcript(first).length).toBeGreaterThan(0);
		});
	}
});
