/**
 * The MCP observer end to end: an extension registers a server that never
 * connects, and the live answer the panel reads still names it. pi's API reports
 * no connection state at all, so "this server exists but holds no tool" is the one
 * thing an extension can add to the tool inventory the host already has.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../../platform/agent-home";
import { SessionRegistry } from "../registry";

/** An operator extension whose server stays registered and disabled, so it connects nothing. */
const ghost = `
export default function ghost(pi) {
	pi.on("session_start", () => {
		pi.registerMcpServer("ghost", { command: "epsilon-ghost-mcp", enabled: false });
	});
}
`;

describe("a server an extension registered", () => {
	test("is named in the live answer even though it holds no tool", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-mcp-observer-"));
		const home = agentHome(dir);
		await mkdir(join(dir, "extensions"), { recursive: true });
		await mkdir(home.chatsDir, { recursive: true });
		await writeFile(join(dir, "extensions", "ghost.ts"), ghost, "utf8");
		const registry = new SessionRegistry(home);
		try {
			const session = await registry.ensure(crypto.randomUUID(), { kind: "chat" });

			expect(session.mcpLive([]).servers).toEqual([{ name: "ghost", tools: [], registered: true }]);
		} finally {
			await registry.disposeAll();
			await rm(dir, { recursive: true, force: true });
		}
	});
});
