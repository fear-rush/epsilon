/**
 * A replacement inside a live chat: pi gives the session a new id, the registry
 * keeps the old one reachable, and a tab watching the chat is told where it moved.
 *
 * This is the path an extension command takes in the dashboard: the same engine,
 * the same `LiveSession`, a different session id every frame now names.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ServerFrame } from "shared";

import { agentHome } from "../../platform/agent-home";
import { SessionRegistry } from "./registry";

/** An operator extension that replaces the session on a command, as `handoff` does. */
const replacer = `
export default function replacer(pi) {
	pi.registerCommand("next", {
		description: "Replace this session",
		handler: async (_args, ctx) => {
			await ctx.newSession();
		},
	});
}
`;

describe("a replaced session", () => {
	test("keeps the old id reachable and tells the tab where it moved", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-replaced-"));
		const home = agentHome(dir);
		await mkdir(join(dir, "extensions"), { recursive: true });
		await mkdir(home.chatsDir, { recursive: true });
		await writeFile(join(dir, "extensions", "replacer.ts"), replacer, "utf8");
		const registry = new SessionRegistry(home);
		const started = crypto.randomUUID();
		try {
			const session = await registry.ensure(started, { kind: "chat" });
			const frames: ServerFrame[] = [];
			const unsubscribe = session.subscribe((frame) => frames.push(frame));
			try {
				await session.run({ type: "prompt", text: "/next" });
			} finally {
				unsubscribe();
			}

			const moved = session.sessionId;
			expect(moved).not.toBe(started);
			const replacement = frames.find((frame) => frame.t === "session-replaced");
			expect(replacement).toEqual({
				t: "session-replaced",
				sessionId: started,
				fromId: started,
				toId: moved,
				reason: "new",
			});
			// A stale tab asking for the old id reaches the live chat instead of
			// opening a second writer on the same file.
			expect(registry.find(started)).toBe(session);
			expect(registry.find(moved)).toBe(session);
			expect(registry.live()).toEqual([{ id: moved, needsInput: false }]);
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});
});
