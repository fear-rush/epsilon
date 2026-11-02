/**
 * What a tab receives on attach, read from a real engine: pi's cache-warmer state
 * and the token counters, which nothing can observe without a provider request.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerFrame } from "shared";

import { agentHome } from "../../platform/agent-home";
import { SessionRegistry } from "./registry";

describe("a snapshot", () => {
	test("carries pi's cache warmer state and its token counters", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-snapshot-"));
		const home = agentHome(dir);
		await mkdir(home.chatsDir, { recursive: true });
		const registry = new SessionRegistry(home);
		try {
			const session = await registry.ensure(crypto.randomUUID(), { kind: "chat" });
			const frames: ServerFrame[] = [];
			const unsubscribe = session.subscribe((frame) => frames.push(frame));
			unsubscribe();
			const frame = frames.find((item) => item.t === "snapshot");
			if (frame?.t !== "snapshot") throw new Error("expected a snapshot frame");
			// pi reports a state before the first request, and the tab must receive it.
			expect(frame.snapshot.state.cacheWarming).toEqual({
				state: "inactive",
				reason: "waiting for first request",
			});
			// The four counters are always there, so the meter can draw them at any time.
			expect(frame.snapshot.state.stats.tokens).toEqual({
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				total: 0,
			});
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});
});
