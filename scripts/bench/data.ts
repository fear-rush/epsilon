import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { linearSession, writeSession } from "../../test/sessions.ts";

/**
 * The dataset the catalog benchmarks run against.
 *
 * The audit measured 500 sessions / 964 MB. This builds 300 sessions, a twelfth of them
 * carrying a 2 MB tool output, which catches an ingest or query regression without adding a
 * minute to every run. The budgets are calibrated against this set.
 */
export type BenchData = {
	readonly home: string;
	readonly root: string;
};

const sessionCount = 300;
const bigOutputBytes = 2 * 1024 * 1024;

/** A large tool result appended to a normal turn, so the big file is still a real session. */
const withBigOutput = (id: string): string => {
	const base = linearSession(id, "/tmp/bench", 30);
	const entry = {
		id: "big-entry",
		message: {
			content: [{ text: "y".repeat(bigOutputBytes), type: "text" }],
			isError: false,
			role: "toolResult",
			toolCallId: "call-big",
			toolName: "bash",
		},
		parentId: "e000029",
		timestamp: "2026-01-01T00:01:00.000Z",
		type: "message",
	};
	return `${base}${JSON.stringify(entry)}\n`;
};

export function prepareBenchData(): BenchData {
	const home = join(tmpdir(), "epsilon-bench-catalog");
	const root = join(home, "sessions", "--bench-project--");
	mkdirSync(root, { recursive: true });
	const existing = existsSync(root)
		? readdirSync(root).filter((file) => file.endsWith(".jsonl")).length
		: 0;
	if (existing < sessionCount) {
		rmSync(join(home, "sessions"), { recursive: true, force: true });
		mkdirSync(root, { recursive: true });
		for (let index = 0; index < sessionCount; index++) {
			const id = `bench-${String(index).padStart(3, "0")}`;
			writeSession(
				root,
				id,
				index % 25 === 0 ? withBigOutput(id) : linearSession(id, "/tmp/bench", 30),
			);
		}
	}
	return { home, root };
}

/** One more turn appended to `count` sessions, as a running engine would append one. */
export function appendTurns(root: string, count: number): ReadonlyArray<string> {
	const paths = readdirSync(root)
		.filter((file) => file.endsWith(".jsonl"))
		.slice(0, count)
		.map((file) => join(root, file));
	for (const path of paths) {
		appendFileSync(
			path,
			`${JSON.stringify({
				id: `appended-${crypto.randomUUID()}`,
				message: { content: [{ text: "appended", type: "text" }], role: "user" },
				parentId: null,
				timestamp: new Date().toISOString(),
				type: "message",
			})}\n`,
		);
	}
	return paths;
}
