/**
 * One socket per tab. Owns the handshake, the sessions this tab watches, and
 * reconnect with backoff (docs/protocol.md, Reconnect). No React: this module
 * is called from a store, not from a component body.
 */
import { PROTOCOL_VERSION, clientFrameSchema, serverFrameSchema } from "shared";
import type { ClientFrame, ServerFrame } from "shared";

export type LinkStatus = "connecting" | "open" | "closed";

export type LinkHandlers = {
	onFrame: (frame: ServerFrame) => void;
	onStatus: (status: LinkStatus) => void;
};

const SOCKET_PATH = "/api/link";
const RECONNECT_STEPS_MS = [500, 1_000, 2_000, 4_000, 8_000];

export class Link {
	private readonly handlers: LinkHandlers;
	private readonly tabId = crypto.randomUUID();
	private readonly watched = new Set<string>();
	private socket: WebSocket | undefined;
	private attempt = 0;

	constructor(handlers: LinkHandlers) {
		this.handlers = handlers;
		this.connect();
	}

	attach(sessionId: string): void {
		this.watched.add(sessionId);
		this.send({ t: "attach", sessionId });
	}

	send(frame: ClientFrame): void {
		if (this.socket?.readyState !== WebSocket.OPEN) return;
		this.socket.send(JSON.stringify(clientFrameSchema.parse(frame)));
	}

	private connect(): void {
		this.handlers.onStatus("connecting");
		const scheme = location.protocol === "https:" ? "wss" : "ws";
		const socket = new WebSocket(`${scheme}://${location.host}${SOCKET_PATH}`);
		this.socket = socket;

		// Ignore everything from a socket this Link already replaced: a retry opens a
		// new one and the old one's `close` lands afterwards.
		const isCurrent = () => this.socket === socket;

		socket.addEventListener("open", () => {
			if (!isCurrent()) return;
			this.send({ t: "hello", protocol: PROTOCOL_VERSION, tabId: this.tabId });
		});
		socket.addEventListener("message", (event) => {
			if (!isCurrent()) return;
			this.receive(String(event.data));
		});
		socket.addEventListener("close", () => {
			if (!isCurrent()) return;
			this.handlers.onStatus("closed");
			this.retry();
		});
	}

	private retry(): void {
		const delay = RECONNECT_STEPS_MS[Math.min(this.attempt, RECONNECT_STEPS_MS.length - 1)];
		this.attempt += 1;
		setTimeout(() => this.connect(), delay);
	}

	private receive(raw: string): void {
		const frame = serverFrameSchema.safeParse(JSON.parse(raw));
		if (!frame.success) return;
		this.attempt = 0;
		if (frame.data.t === "welcome") {
			this.handlers.onStatus("open");
			for (const sessionId of this.watched) this.send({ t: "attach", sessionId });
		}
		this.handlers.onFrame(frame.data);
	}
}
