/**
 * The tab's socket: one per tab, per docs/protocol.md. Stores come and go with
 * routes; the socket does not. Frames are routed to the stores watching their
 * sessionId, so a late store joins a socket that is already open.
 */
import { PROTOCOL_VERSION, clientFrameSchema, serverFrameSchema } from "shared";
import type { ClientFrame, ServerFrame } from "shared";

export type LinkStatus = "connecting" | "open" | "closed";

type FrameHandler = (frame: ServerFrame) => void;
type StatusHandler = (status: LinkStatus) => void;

const SOCKET_PATH = "/api/link";
const RECONNECT_STEPS_MS = [500, 1_000, 2_000, 4_000, 8_000];

class Link {
	private readonly tabId = crypto.randomUUID();
	private readonly frames = new Map<string, Set<FrameHandler>>();
	private readonly statusListeners = new Set<StatusHandler>();
	private socket: WebSocket | undefined;
	private status: LinkStatus = "connecting";
	private attempt = 0;

	constructor() {
		this.connect();
	}

	get current(): LinkStatus {
		return this.status;
	}

	/** The current status, then every change. Called immediately on subscribe. */
	onStatus(listener: StatusHandler): () => void {
		this.statusListeners.add(listener);
		listener(this.status);
		return () => this.statusListeners.delete(listener);
	}

	/** Watch one session. Returns the detach for that session alone. */
	attach(sessionId: string, onFrame: FrameHandler): () => void {
		const handlers = this.frames.get(sessionId) ?? new Set<FrameHandler>();
		handlers.add(onFrame);
		this.frames.set(sessionId, handlers);
		this.send({ t: "attach", sessionId });
		return () => this.detach(sessionId, onFrame);
	}

	send(frame: ClientFrame): void {
		if (this.socket?.readyState !== WebSocket.OPEN) return;
		this.socket.send(JSON.stringify(clientFrameSchema.parse(frame)));
	}

	private detach(sessionId: string, onFrame: FrameHandler): void {
		const handlers = this.frames.get(sessionId);
		if (handlers === undefined) return;
		handlers.delete(onFrame);
		if (handlers.size > 0) return;
		this.frames.delete(sessionId);
		this.send({ t: "detach", sessionId });
	}

	private connect(): void {
		this.setStatus("connecting");
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
			this.setStatus("closed");
			this.retry();
		});
	}

	private retry(): void {
		const delay = RECONNECT_STEPS_MS[Math.min(this.attempt, RECONNECT_STEPS_MS.length - 1)];
		this.attempt += 1;
		setTimeout(() => this.connect(), delay);
	}

	private setStatus(status: LinkStatus): void {
		this.status = status;
		for (const listener of this.statusListeners) listener(status);
	}

	private receive(raw: string): void {
		const frame = serverFrameSchema.safeParse(JSON.parse(raw));
		if (!frame.success) return;
		this.attempt = 0;
		if (frame.data.t === "welcome") {
			this.setStatus("open");
			for (const sessionId of this.frames.keys()) this.send({ t: "attach", sessionId });
		}
		if (!("sessionId" in frame.data)) return;
		const sessionId = frame.data.sessionId;
		if (sessionId === undefined) return;
		for (const handler of this.frames.get(sessionId) ?? []) handler(frame.data);
	}
}

/** The tab's one socket. The chunk that imports it is the session page. */
export const link = new Link();
