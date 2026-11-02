/**
 * pi reports the MCP servers it could not use as one notice, and that notice is
 * the only place its connection state leaves the extension. These checks pin the
 * two shapes it writes and prove the whole path: a server pi cannot start is read
 * back from a real engine as a failure with pi's own sentence, and a later reload
 * does not keep the answer after the server is gone.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../platform/agent-home";
import { SessionRegistry } from "../conversation";
import { readMcpAttention } from "./attention";
import { setMcpServerEnabled, writeMcpServer } from "./service";
import type { McpLive } from "./contract";

/** pi's notice for a server that needs a sign-in, verbatim. */
const NEEDS_SIGN_IN = `MCP servers need attention:
  docs: needs sign-in
Run /mcp to fix.`;

/** pi's notice for a server whose connection failed, verbatim. */
const FAILED = `MCP servers need attention:
  my-files: failed: connect ECONNREFUSED 127.0.0.1:3001
  docs: needs sign-in
Run /mcp to fix.`;

describe("pi's attention notice", () => {
	test("names the servers it reports, with pi's own kind and text", () => {
		expect([...readMcpAttention(FAILED)]).toEqual([
			["my-files", { kind: "failed", message: "connect ECONNREFUSED 127.0.0.1:3001" }],
			["docs", { kind: "needs-sign-in" }],
		]);
	});

	test("a file pi could not read is not a server", () => {
		const notice = `MCP servers need attention:
  config: mcpServers.files.command must be a string
Run /mcp to fix.`;

		expect(readMcpAttention(notice).size).toBe(0);
		expect([...readMcpAttention(NEEDS_SIGN_IN).keys()]).toEqual(["docs"]);
	});

	test("an ordinary notice says nothing about any server", () => {
		expect(readMcpAttention('Signed in to MCP server "docs".').size).toBe(0);
		expect(readMcpAttention("").size).toBe(0);
	});
});

/** What these checks read from a live session: pi's answer for the configured names. */
type LiveRead = { mcpLive(names: readonly string[]): McpLive };

/**
 * The attention pi reported for one server, once it arrives: a connection that
 * cannot start settles asynchronously after the session starts.
 */
const attentionUntil = async (session: LiveRead, name: string) => {
	const deadline = Date.now() + 10_000;
	for (;;) {
		const row = session.mcpLive([name]).servers.find((server) => server.name === name);
		if (row?.attention !== undefined) return row.attention;
		if (Date.now() > deadline) throw new Error(`pi never reported ${name}: ${JSON.stringify(row)}`);
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
};

describe("a server pi cannot use", () => {
	test("is read back as pi's failure, and a reload drops it once the server is off", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-mcp-attention-"));
		const home = agentHome(dir);
		await mkdir(home.chatsDir, { recursive: true });
		const entry = {
			scope: "global" as const,
			name: "broken",
			transport: "stdio" as const,
			// A command that does not exist, so pi's own spawn failure is the message.
			command: "epsilon-no-such-mcp-server",
			args: [],
			cwd: "",
		};
		// pi's MCP extension reads `mcp.json` from its own config directory, not from
		// the engine's, so the scratch home is published the way `main.ts` publishes it.
		const previous = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = home.dir;
		const registry = new SessionRegistry(home);
		try {
			await writeMcpServer(home, home.chatsDir, entry);
			const session = await registry.ensure(crypto.randomUUID(), { kind: "chat" });
			const attention = await attentionUntil(session, "broken");
			expect(attention.kind).toBe("failed");
			expect(attention.kind === "failed" ? attention.message.length > 0 : false).toBe(true);

			await setMcpServerEnabled(home, home.chatsDir, entry.scope, entry.name, false);
			registry.reloadAll();

			const deadline = Date.now() + 10_000;
			for (;;) {
				const row = session.mcpLive(["broken"]).servers.find((server) => server.name === "broken");
				if (row?.attention === undefined) break;
				if (Date.now() > deadline) throw new Error("pi kept reporting a server it no longer uses");
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
		} finally {
			await registry.disposeAll();
			if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previous;
			await rm(dir, { recursive: true, force: true });
		}
	}, 20_000);
});
