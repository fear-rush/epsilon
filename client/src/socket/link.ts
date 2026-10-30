/**
 * The tab's socket: one per tab, per shared/src/protocol/frames.ts. Stores come and go with
 * routes; the socket does not. Frames are routed to the stores watching their
 * sessionId, so a late store joins a socket that is already open.
 */
import { PROTOCOL_VERSION, clientFrameSchema, serverFrameSchema } from "shared";
import type { ClientFrame, ServerFrame } from "shared";

export type LinkStatus = "connecting" | "open" | "closed" | "blocked";

type FrameHandler = (frame: ServerFrame) => void;
type StatusHandler = (status: LinkStatus) => void;
/** A frame this page could not read, so the session can show it (AGENTS.md, Invariants). */
type ProblemHandler = (message: string) => void;

const SOCKET_PATH = "/api/link";
const RECONNECT_STEPS_MS = [500, 1_000, 2_000, 4_000, 8_000];

class Link {
	private readonly tabId = crypto.randomUUID();
	private readonly frames = new Map<string, Set<FrameHandler>>();
	private readonly statusListeners = new Set<StatusHandler>();
	private readonly problemListeners = new Set<ProblemHandler>();
	private socket: WebSocket | undefined;
	private status: LinkStatus = "connecting";
	private attempt = 0;
	/** One report per connection: a decoding bug must not become an endless notice. */
	private reportedProblem = false;

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

	/** A frame this page cannot read, reported once per connection. */
	onProblem(listener: ProblemHandler): () => void {
		this.problemListeners.add(listener);
		return () => this.problemListeners.delete(listener);
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
		this.reportedProblem = false;
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

	private report(message: string): void {
		if (this.reportedProblem) return;
		this.reportedProblem = true;
		for (const listener of this.problemListeners) listener(message);
	}

	private receive(raw: string): void {
		let value: unknown;
		try {
			value = JSON.parse(raw);
		} catch {
			this.report("The server sent a frame that is not JSON.");
			return;
		}
		const frame = serverFrameSchema.safeParse(value);
		if (!frame.success) {
			this.report("The server sent a frame this page cannot read.");
			return;
		}
		this.attempt = 0;
		if (frame.data.t === "welcome") {
			this.setStatus("open");
			for (const sessionId of this.frames.keys()) this.send({ t: "attach", sessionId });
			return;
		}
		if (frame.data.t === "error") {
			// A protocol mismatch is a whole-page condition: the page shows a reload
			// notice, and guessing at changed frames is worse than a stale tab.
			if (frame.data.code === "PROTOCOL_MISMATCH") {
				this.setStatus("blocked");
				return;
			}
			if (frame.data.sessionId === undefined) {
				this.report(`${frame.data.code}: ${frame.data.message}`);
				return;
			}
		}
		if (!("sessionId" in frame.data)) return;
		const sessionId = frame.data.sessionId;
		if (sessionId === undefined) return;
		for (const handler of this.frames.get(sessionId) ?? []) handler(frame.data);
	}
}

/** The tab's one socket. The chunk that imports it is the session page. */
export const link = new Link();
