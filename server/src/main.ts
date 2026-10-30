/**
 * The only listener, and the only module that reads `process.env`
 * (docs/architecture.md). It chooses the agent home and the project once, builds
 * the dependencies every feature receives, and serves. REST goes to the Hono app;
 * `/api/link` upgrades to the browser socket. Bound to loopback: access control is
 * loopback plus the tunnel in front (docs/protocol.md, Non-goals).
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { createApp } from "./app";
import type { Deps } from "./deps";
import { SessionRegistry } from "./features/conversation/registry";
import { handleClose, handleMessage, handleOpen } from "./features/conversation/socket";
import type { ChatState } from "./features/conversation/socket";
import { agentHome } from "./platform/agent-home";

const HOST = "127.0.0.1";
const SOCKET_PATH = "/api/link";

/**
 * `server/src` in a source run and `server/dist` after a build, so the repo root
 * is two levels up either way. Not `process.cwd()`: `turbo dev` starts this task
 * inside `server/`, and pi reads that as the project, which hides every session
 * the terminal created at the root.
 */
const repoRoot = resolve(import.meta.dirname, "../..");

/**
 * The agent home: pi's settings, credentials, extensions, packages and sessions.
 * Chosen here, from our own variable or pi's default, never from an inherited
 * `PI_CODING_AGENT_DIR` (AGENTS.md rule 9).
 */
const home = agentHome(resolve(process.env.EPSILON_AGENT_HOME ?? join(homedir(), ".pi", "agent")));

/**
 * pi resolves its own paths — including the session list this server reads — from
 * its config directory at call time. Publishing the choice here is what keeps
 * those reads on the same home the engine is given; without it the list would
 * come from one home and the turns would write to another.
 */
process.env.PI_CODING_AGENT_DIR = home.dir;

const projectDir = resolve(process.env.EPSILON_PROJECT ?? repoRoot);
const engines = new SessionRegistry({ cwd: projectDir, home });
const deps: Deps = { home, projectDir, engines };
const app = createApp(deps);

const server = Bun.serve<ChatState>({
	port: Number(process.env.PORT ?? 3000),
	hostname: HOST,
	fetch(request, bunServer) {
		const { pathname } = new URL(request.url);
		if (pathname !== SOCKET_PATH) return app.fetch(request);
		const tabId = crypto.randomUUID();
		const upgraded = bunServer.upgrade(request, {
			data: {
				tabId,
				welcomed: false,
				closed: false,
				wanted: new Set(),
				unsubscribes: new Map(),
				attaching: new Map(),
			},
		});
		return upgraded ? undefined : new Response("Expected a WebSocket upgrade", { status: 400 });
	},
	websocket: {
		open: handleOpen,
		message: (socket, message) => {
			handleMessage(engines, socket, String(message));
		},
		close: handleClose,
	},
});

console.log(
	`epsilon on http://${HOST}:${server.port} (socket ${SOCKET_PATH}, project ${projectDir})`,
);

const shutdown = (): void => {
	engines.disposeAll();
	server.stop(true);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
