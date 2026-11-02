/**
 * A server that offers resources and no tool. pi registers its three resource
 * tools for the session as soon as one enabled server has resources, and never
 * says which server that was, so the panel can name what reaches resources but not
 * where they come from. This runs a real resources-only server to prove both
 * halves: the tools appear, and the server itself registers nothing.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../platform/agent-home";
import { SessionRegistry } from "../conversation";
import { writeMcpServer } from "./service";
import type { McpLive } from "./contract";

/** The smallest MCP server that declares resources and offers no tool. */
const RESOURCES_ONLY = `
const resources = [{ uri: "file:///notes.md", name: "notes", mimeType: "text/markdown" }];
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
let buffered = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
	buffered += chunk;
	for (let end = buffered.indexOf("\\n"); end !== -1; end = buffered.indexOf("\\n")) {
		const line = buffered.slice(0, end).trim();
		buffered = buffered.slice(end + 1);
		if (line === "") continue;
		const message = JSON.parse(line);
		if (message.id === undefined) continue;
		if (message.method === "initialize") {
			reply(message.id, {
				protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
				capabilities: { resources: {} },
				serverInfo: { name: "notes", version: "1.0.0" },
			});
		} else if (message.method === "resources/list") {
			reply(message.id, { resources });
		} else if (message.method === "resources/templates/list") {
			reply(message.id, { resourceTemplates: [] });
		} else if (message.method === "tools/list") {
			reply(message.id, { tools: [] });
		} else {
			reply(message.id, {});
		}
	}
});
process.stdin.on("end", () => process.exit(0));
`;

type LiveRead = { mcpLive(names: readonly string[]): McpLive };

/** The live answer, once pi has registered the resource tools for the session. */
const liveUntil = async (session: LiveRead): Promise<McpLive> => {
	const deadline = Date.now() + 10_000;
	for (;;) {
		const live = session.mcpLive(["notes"]);
		if (live.resourceTools.length > 0) return live;
		if (Date.now() > deadline)
			throw new Error(`pi never registered a resource tool: ${JSON.stringify(live)}`);
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
};

describe("a server that offers only resources", () => {
	test("is reachable through the three resource tools, and registers no tool of its own", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-mcp-resources-"));
		const home = agentHome(dir);
		await mkdir(home.chatsDir, { recursive: true });
		const probe = join(dir, "resources.js");
		await writeFile(probe, RESOURCES_ONLY, "utf8");
		// pi's MCP extension reads `mcp.json` from its own config directory, not from the
		// engine's, so the scratch home is published the way `main.ts` publishes it.
		const previous = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = home.dir;
		const registry = new SessionRegistry(home);
		try {
			await writeMcpServer(home, home.chatsDir, {
				scope: "global",
				name: "notes",
				transport: "stdio",
				command: process.execPath,
				args: [probe],
				cwd: "",
				exposure: "direct",
			});
			const session = await registry.ensure(crypto.randomUUID(), { kind: "chat" });
			const live = await liveUntil(session);

			expect(live.resourceTools).toEqual([
				"list_mcp_resource_templates",
				"list_mcp_resources",
				"read_mcp_resource",
			]);
			// pi names no server for them: a server with no tool gets no row, so the
			// resource tools are all a host is told about it.
			expect(live.servers).toEqual([]);
		} finally {
			await registry.disposeAll();
			if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previous;
			await rm(dir, { recursive: true, force: true });
		}
	}, 20_000);
});
