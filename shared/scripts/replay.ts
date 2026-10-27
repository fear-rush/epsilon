/**
 * Replay a recorded fixture through the reducer twice and compare the result.
 * This is the only test that catches ordering bugs (docs/plan.md, Risks), and it
 * uses a real trace, not a hand-written event sequence.
 *
 *   bun run scripts/replay.ts                 # every fixture
 *   bun run scripts/replay.ts bash-turn       # one fixture, printed
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { emptyConversation, reduce, serverFrameSchema, transcript } from "shared";

const FIXTURES = "src/conversation/fixtures";
const sessionId = "fixture";

/** A `.jsonl` file is an event log; a `.json` file is one frame, such as a snapshot. */
const replay = (path: string) => {
	if (path.endsWith(".json")) {
		return reduce(
			emptyConversation,
			serverFrameSchema.parse(JSON.parse(readFileSync(path, "utf8"))),
		);
	}
	const lines = readFileSync(path, "utf8").trim().split("\n");
	let state = emptyConversation;
	for (const line of lines) {
		const frame = serverFrameSchema.parse({ t: "event", sessionId, event: JSON.parse(line) });
		state = reduce(state, frame);
	}
	return state;
};

const rowText = (row: ReturnType<typeof transcript>[number]): string => {
	switch (row.kind) {
		case "user":
			return row.text;
		case "assistant":
			return `${row.streaming ? "(streaming) " : ""}${row.text}`;
		case "tool":
			return `${row.run.toolName} [${row.run.status}] ${row.run.output.split("\n")[0] ?? ""}`;
		case "summary":
			return `${row.label}: ${row.text.split("\n")[0] ?? ""}`;
		case "notice":
			return row.notice.text;
	}
};

const names = process.argv.slice(2);
const files = readdirSync(FIXTURES).filter(
	(name) => name.endsWith(".jsonl") || name.endsWith(".json"),
);
const selected =
	names.length > 0 ? files.filter((name) => names.some((n) => name.includes(n))) : files;

let failed = false;
for (const name of selected) {
	const path = join(FIXTURES, name);
	const first = replay(path);
	const second = replay(path);
	const identical = JSON.stringify(first) === JSON.stringify(second);
	const rows = transcript(first);
	console.log(
		`${name}: ${rows.length} rows, ${identical ? "identical on replay" : "DIFFERS ON REPLAY"}`,
	);
	if (!identical) failed = true;
	if (names.length > 0) {
		for (const row of rows) {
			console.log(`  ${row.kind.padEnd(9)} ${rowText(row)}`);
		}
	}
}

process.exit(failed ? 1 : 0);
