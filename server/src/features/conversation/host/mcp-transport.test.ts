/**
 * What closing a session host does to the MCP servers pi started for it. A bare
 * `AgentSession.dispose()` emitted no `session_shutdown`, so pi's MCP extension
 * never closed its transports and a stdio server outlived the chat. The host
 * disposes the runtime, and this pins the observable half: the child process ends.
 */
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agentHome } from "../../../platform/agent-home";
import { writeMcpServer } from "../../mcp";
import type { UiHost } from "../ui-context";
import { bindHost } from "./bindings";
import { SessionHost } from "./host";

/** A host with no tab behind it: a question is refused, displays are dropped. */
const NO_TAB: UiHost = {
	ask: async (question) => ({ id: question.id, method: "cancel" }),
	display: () => undefined,
	editorText: () => "",
	toolsExpanded: () => false,
	setToolsExpanded: () => undefined,
	addAutocompleteProvider: () => undefined,
	unsupported: () => undefined,
	fail: (error) => {
		throw error;
	},
	notice: () => undefined,
};

/**
 * The smallest MCP server that completes the handshake and then stays alive. It
 * ignores a closed stdin on purpose, so only a kill can end it, and it records
 * both facts the test reads: its pid once it runs, and its exit once it is stopped.
 */
const SERVER = String.raw`
import { writeFileSync } from "node:fs";

const [pidFile, exitFile] = process.argv.slice(2);
const leave = () => {
	writeFileSync(exitFile, "exited");
	process.exit(0);
};
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, leave);
process.on("exit", () => writeFileSync(exitFile, "exited"));
writeFileSync(pidFile, String(process.pid));

const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
let buffered = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
	buffered += chunk;
	for (let end = buffered.indexOf("\n"); end !== -1; end = buffered.indexOf("\n")) {
		const line = buffered.slice(0, end).trim();
		buffered = buffered.slice(end + 1);
		if (line === "") continue;
		const message = JSON.parse(line);
		if (message.id === undefined) continue;
		if (message.method === "initialize") {
			reply(message.id, {
				protocolVersion: message.params?.protocolVersion ?? "2025-06-18",
				capabilities: { tools: {} },
				serverInfo: { name: "teardown", version: "1.0.0" },
			});
		} else if (message.method === "tools/list") {
			reply(message.id, { tools: [] });
		} else {
			reply(message.id, {});
		}
	}
});
// A closed pipe must not end this server: only the host's teardown may.
process.stdin.on("end", () => undefined);
setTimeout(() => process.exit(0), 60_000);
`;

const waitFor = async (predicate: () => boolean, what: string): Promise<void> => {
	const deadline = Date.now() + 15_000;
	while (!predicate()) {
		if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
		await Bun.sleep(25);
	}
};

describe("closing the session host", () => {
	test("stops the MCP server pi started for it", async () => {
		const dir = await mkdtemp(join(tmpdir(), "epsilon-mcp-teardown-"));
		const home = agentHome(dir);
		await mkdir(home.chatsDir, { recursive: true });
		const pidFile = join(dir, "server.pid");
		const exitFile = join(dir, "server.exit");
		const fixture = join(dir, "server.mjs");
		await writeFile(fixture, SERVER, "utf8");
		await writeMcpServer(home, home.chatsDir, {
			scope: "global",
			name: "teardown",
			transport: "stdio",
			command: process.execPath,
			args: [fixture, pidFile, exitFile],
			cwd: "",
			exposure: "direct",
		});

		// pi's MCP extension reads `mcp.json` from its own config directory, not from
		// the engine's agentDir, so the scratch home is published the way `main.ts` does.
		const previous = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = home.dir;
		const host = await SessionHost.open({
			home,
			cwd: home.chatsDir,
			sessionId: crypto.randomUUID(),
			file: undefined,
			chat: true,
		});
		let closed = false;
		const close = async (): Promise<void> => {
			if (closed) return;
			closed = true;
			await host.close();
		};
		try {
			// Binding is what starts the session's extensions, pi's MCP extension included.
			await bindHost(host, NO_TAB);
			await waitFor(() => existsSync(pidFile), "the MCP server to start");
			// The server answered the handshake and is still up: the close below is what
			// ends it, not a failed connection pi gave up on.
			expect(existsSync(exitFile)).toBe(false);

			await close();

			await waitFor(() => existsSync(exitFile), "the MCP server to stop");
		} finally {
			await close();
			if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previous;
			await rm(dir, { recursive: true, force: true });
		}
	}, 30_000);
});
