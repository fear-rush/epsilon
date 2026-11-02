/**
 * The rule a tool switch writes, checked against pi itself. pi matches a
 * `toolExposure` key against the name the server reports, and registers the tool
 * under a name where every character but `[A-Za-z0-9_]` became `_`. A server tool
 * called `read-file` is therefore unreachable by the key `read_file`, which is what
 * `mcpToolAddress()` exists to avoid.
 *
 * This runs a real MCP server over stdio and a real engine, so the answers are
 * pi's: its own registration, its own matcher, and its own reload after a write.
 */
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../platform/agent-home";
import { SessionRegistry } from "../conversation";
import { writeMcpServer } from "./service";
import type { McpLive } from "./contract";

/** The smallest MCP server that offers two tools, one of them with a dash in its name. */
const PROBE = `
const tools = [
	{ name: "read-file", description: "Reads one file.", inputSchema: { type: "object", properties: {} } },
	{ name: "write-file", description: "Writes one file.", inputSchema: { type: "object", properties: {} } },
];
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
				capabilities: { tools: {} },
				serverInfo: { name: "probe", version: "1.0.0" },
			});
		} else if (message.method === "tools/list") {
			reply(message.id, { tools });
		} else {
			reply(message.id, {});
		}
	}
});
process.stdin.on("end", () => process.exit(0));
`;

/** What these checks read from a live session: pi's answer for the probe server. */
type LiveRead = { mcpLive(names: readonly string[]): McpLive };

/** The rows the engine reports for the probe, once the server has connected. */
const rows = (session: LiveRead) =>
	session.mcpLive(["probe"]).servers.find((server) => server.name === "probe")?.tools;

/**
 * The rows, once they arrive: a stdio server connects after the session starts, and
 * a reload re-registers its tools after the write.
 */
const rowsUntil = async (
	session: LiveRead,
	ready: (tools: NonNullable<ReturnType<typeof rows>>) => boolean,
): Promise<NonNullable<ReturnType<typeof rows>>> => {
	const deadline = Date.now() + 10_000;
	for (;;) {
		const tools = rows(session);
		if (tools !== undefined && ready(tools)) return tools;
		if (Date.now() > deadline) {
			throw new Error(`The probe server never answered: ${JSON.stringify(tools)}`);
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
};

describe("a tool switch", () => {
	test("writes the name pi matches, so the tool it hides is the tool pi hides", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-mcp-exposure-"));
		const home = agentHome(dir);
		await mkdir(home.chatsDir, { recursive: true });
		const probe = join(dir, "probe.js");
		await writeFile(probe, PROBE, "utf8");
		const entry = {
			scope: "global" as const,
			name: "probe",
			transport: "stdio" as const,
			command: process.execPath,
			args: [probe],
			cwd: "",
			exposure: "direct" as const,
		};
		// pi's MCP extension reads `mcp.json` from its own config directory, not from the
		// engine's, so the scratch home is published the way `main.ts` publishes it.
		const previous = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = home.dir;
		const registry = new SessionRegistry(home);
		try {
			// The recovered spelling, which pi does not match against `read-file`.
			await writeMcpServer(home, home.chatsDir, {
				...entry,
				toolExposure: { read_file: "hidden" },
			});
			const session = await registry.ensure(crypto.randomUUID(), { kind: "chat" });
			const before = await rowsUntil(session, (tools) => tools.length === 2);
			expect(before.map((tool) => [tool.name, tool.key, tool.exposure])).toEqual([
				["read_file", "read*file", "direct"],
				["write_file", "write*file", "direct"],
			]);

			// The key the switch derives, written the way the panel writes it.
			await writeMcpServer(home, home.chatsDir, {
				...entry,
				toolExposure: { "read*file": "hidden" },
			});
			registry.reloadAll();

			const after = await rowsUntil(session, (tools) =>
				tools.some((tool) => tool.exposure === "hidden"),
			);
			expect(after.map((tool) => [tool.name, tool.exposure])).toEqual([
				["read_file", "hidden"],
				// The pattern stops at the name it was derived from.
				["write_file", "direct"],
			]);
		} finally {
			await registry.disposeAll();
			if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previous;
			await rm(dir, { recursive: true, force: true });
		}
	}, 20_000);
});
