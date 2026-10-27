/**
 * The only listener. REST goes to the Hono app; `/api/link` upgrades to the
 * browser socket. Bound to loopback: access control is loopback plus the tunnel
 * in front (docs/protocol.md, Non-goals).
 */
import app from "./index";
import { SessionRegistry } from "./agent/registry";
import { config } from "./config";
import { handleClose, handleMessage, handleOpen } from "./ws/chat";
import type { ChatState } from "./ws/chat";

const registry = new SessionRegistry(config.projectDir);

const server = Bun.serve<ChatState>({
	port: config.port,
	hostname: config.host,
	fetch(request, bunServer) {
		const { pathname } = new URL(request.url);
		if (pathname !== config.socketPath) return app.fetch(request);
		const tabId = crypto.randomUUID();
		const upgraded = bunServer.upgrade(request, {
			data: { tabId, welcomed: false, unsubscribes: new Map() },
		});
		return upgraded ? undefined : new Response("Expected a WebSocket upgrade", { status: 400 });
	},
	websocket: {
		open: handleOpen,
		message: (socket, message) => {
			handleMessage(registry, socket, String(message));
		},
		close: handleClose,
	},
});

console.log(
	`epsilon on http://${config.host}:${server.port} (socket ${config.socketPath}, project ${config.projectDir})`,
);

const shutdown = (): void => {
	registry.killAll();
	server.stop(true);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
