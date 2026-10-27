/**
 * The only listener. REST goes to the Hono app; `/api/link` upgrades to the
 * browser socket. Bound to loopback: access control is loopback plus the tunnel
 * in front (docs/protocol.md, Non-goals).
 */
import app from "./index";
import { SessionRegistry } from "./agent/registry";
import { handleClose, handleMessage, handleOpen } from "./ws/chat";
import type { ChatState } from "./ws/chat";

const SOCKET_PATH = "/api/link";
const PORT = Number(process.env.PORT ?? 3000);
const HOST = "127.0.0.1";

const registry = new SessionRegistry(process.cwd());

const server = Bun.serve<ChatState>({
	port: PORT,
	hostname: HOST,
	fetch(request, bunServer) {
		const { pathname } = new URL(request.url);
		if (pathname !== SOCKET_PATH) return app.fetch(request);
		const tabId = crypto.randomUUID();
		const upgraded = bunServer.upgrade(request, {
			data: { tabId, welcomed: false, unsubscribes: new Set() },
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

console.log(`epsilon on http://${HOST}:${server.port} (socket ${SOCKET_PATH})`);

const shutdown = (): void => {
	registry.killAll();
	server.stop(true);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
