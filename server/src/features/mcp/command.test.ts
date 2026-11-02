/**
 * The panel's sign-in buttons run the same line a typed `/mcp …` becomes, in the
 * live chat of the folder, and answer which chat it ran in. pi's command answers
 * outside its TUI with a notice, so that sentence coming back is the proof the
 * whole path ran: Epsilon's command, pi's `prompt()`, the MCP extension and the
 * notice frame the chat shows.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerFrame } from "shared";

import { agentHome } from "../../platform/agent-home";
import { SessionRegistry } from "../conversation";

/** The notice pi answers with, once it has looked for the server it was told to use. */
const MISSING = 'No MCP server named "ghost".';

/** pi's answer arrives as the notify pi's command shows, which a tab renders as a notice. */
const noticeUntil = async (frames: ServerFrame[]): Promise<string> => {
	const deadline = Date.now() + 10_000;
	for (;;) {
		const shown = frames.flatMap((frame) =>
			frame.t === "ui" && frame.request.method === "notify" ? [frame.request.message] : [],
		);
		const answer = shown.find((message) => message.includes(MISSING));
		if (answer !== undefined) return answer;
		if (Date.now() > deadline) throw new Error(`pi never answered: ${JSON.stringify(shown)}`);
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
};

describe("an MCP command from the settings page", () => {
	test("runs in the live chat of its folder, and its answer is that chat's notice", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-mcp-command-"));
		const home = agentHome(dir);
		await mkdir(home.chatsDir, { recursive: true });
		// pi's MCP extension reads `mcp.json` from its own config directory, not from the
		// engine's, so the scratch home is published the way `main.ts` publishes it.
		const previous = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = home.dir;
		const registry = new SessionRegistry(home);
		try {
			const session = await registry.ensure(crypto.randomUUID(), { kind: "chat" });
			const frames: ServerFrame[] = [];
			session.subscribe((frame) => frames.push(frame));

			const ran = await registry.runInFolder(home.chatsDir, "/mcp logout ghost");

			expect(ran).toBe(session.sessionId);
			expect(await noticeUntil(frames)).toContain("ghost");
		} finally {
			await registry.disposeAll();
			if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previous;
			await rm(dir, { recursive: true, force: true });
		}
	}, 20_000);

	test("has nowhere to run while no engine is open in that folder", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-mcp-command-"));
		const home = agentHome(dir);
		const registry = new SessionRegistry(home);
		try {
			expect(await registry.runInFolder(home.chatsDir, "/mcp login ghost")).toBeUndefined();
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});
});
