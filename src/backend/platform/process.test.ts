import { describe, expect, test } from "bun:test";

import { Effect } from "effect";

import { ProcessFailed, TimedOut } from "./errors.ts";
import { runCommand } from "./process.ts";

describe("runCommand", () => {
	test("fails with the command's own output when it exits non-zero", async () => {
		const error = await Effect.runPromise(
			Effect.flip(
				runCommand({
					command: ["sh", "-c", "echo nope >&2; exit 3"],
					timeoutMs: 5_000,
				}),
			),
		);
		expect(error).toBeInstanceOf(ProcessFailed);
		if (error instanceof ProcessFailed) {
			expect(error.code).toBe(3);
			expect(error.stderr).toContain("nope");
		}
	});

	test("kills the whole group at the deadline, including a grandchild (F8e)", async () => {
		// The shell starts a background sleep and waits on another: a kill that misses the
		// group leaves the background process holding the pipes, and this call never returns.
		// Bun's per-test timeout is the bound: the test hangs rather than passing slowly.
		const error = await Effect.runPromise(
			Effect.flip(runCommand({ command: ["sh", "-c", "sleep 5 & sleep 5"], timeoutMs: 150 })),
		);
		expect(error).toBeInstanceOf(TimedOut);
	});
});
