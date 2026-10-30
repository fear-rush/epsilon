/**
 * The browser socket: version handshake, attach/detach, commands and dialog
 * answers. The contract is shared/src/protocol/frames.ts; frames are parsed with the shared
 * zod schemas, never with a parallel copy.
 *
 * One connection may watch several sessions. Frames carry their own
 * `sessionId`, so there is no ambient "current session".
 */
import { PROTOCOL_VERSION, clientFrameSchema, serverFrameSchema } from "shared";
import type { ClientFrame, ProtocolErrorCode, ServerFrame } from "shared";
import type { ServerWebSocket } from "bun";

import type { LiveSession } from "./session";

/** What the socket uses of a live session; a test stands in with a small fake. */
export type Watchable = Pick<
	LiveSession,
	"isOpen" | "subscribe" | "release" | "run" | "answerDialog"
>;

/** What the socket uses of the registry. `SessionRegistry` satisfies it. */
export type Engines = {
	ensure: (sessionId: string) => Promise<Watchable>;
	find: (sessionId: string) => Watchable | undefined;
};

/** What one browser tab is: its id, whether it said hello, the sessions it watches. */
export type ChatState = {
	tabId: string;
	welcomed: boolean;
	closed: boolean;
	/** Sessions this tab asked for, including ones whose engine is still being built. */
	wanted: Set<string>;
	/** One unsubscribe per watched session. A tab may watch several at once. */
	unsubscribes: Map<string, () => void>;
	/** Engine creation in flight, so an attach and a command await one build. */
	attaching: Map<string, Promise<Watchable | undefined>>;
};

export type ChatSocket = Pick<ServerWebSocket<ChatState>, "data" | "send">;

/**
 * Send one frame. A frame this build cannot describe is a bug in the engine, not
 * in the tab, so it is logged and the tab gets a sentence instead of a silent
 * half-written stream.
 */
const send = (socket: ChatSocket, frame: ServerFrame): void => {
	const checked = serverFrameSchema.safeParse(frame);
	if (!checked.success) {
		console.error("epsilon: refusing to send an invalid frame", frame.t, checked.error.issues);
		socket.send(
			JSON.stringify({
				t: "error",
				code: "AGENT_FAILED",
				message: "The agent produced a frame this deployment cannot send.",
			}),
		);
		return;
	}
	socket.send(JSON.stringify(checked.data));
};

const sendError = (
	socket: ChatSocket,
	code: ProtocolErrorCode,
	message: string,
	sessionId?: string,
): void => {
	const frame: ServerFrame = { t: "error", code, message };
	if (sessionId !== undefined) frame.sessionId = sessionId;
	send(socket, frame);
};

export const handleOpen = (socket: ChatSocket): void => {
	socket.data.welcomed = false;
	socket.data.closed = false;
};

export const handleClose = (socket: ChatSocket): void => {
	socket.data.closed = true;
	socket.data.wanted.clear();
	for (const unsubscribe of socket.data.unsubscribes.values()) unsubscribe();
	socket.data.unsubscribes.clear();
};

export const handleMessage = (engines: Engines, socket: ChatSocket, raw: string): void => {
	const parsed = parseFrame(raw);
	if (parsed === undefined) {
		sendError(socket, "UNSUPPORTED_FRAME", "Frame is not valid JSON for this protocol");
		return;
	}
	if (!parsed.success) {
		sendError(socket, "UNSUPPORTED_FRAME", issuesOf(parsed));
		return;
	}
	const frame = parsed.data;
	if (frame.t !== "hello" && !socket.data.welcomed) {
		sendError(socket, "PROTOCOL_MISMATCH", "Send hello first");
		return;
	}
	void route(engines, socket, frame);
};

const issuesOf = (
	parsed: Extract<ReturnType<typeof clientFrameSchema.safeParse>, { success: false }>,
): string => parsed.error.issues.map((issue) => issue.message).join("; ");

const parseFrame = (raw: string): ReturnType<typeof clientFrameSchema.safeParse> | undefined => {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return undefined;
	}
	return clientFrameSchema.safeParse(value);
};

const route = async (engines: Engines, socket: ChatSocket, frame: ClientFrame): Promise<void> => {
	switch (frame.t) {
		case "hello":
			welcome(socket, frame);
			return;
		case "attach":
			await watch(engines, socket, frame.sessionId);
			return;
		case "detach":
			unwatch(socket, frame.sessionId);
			return;
		case "command": {
			const session = await watch(engines, socket, frame.sessionId);
			await session?.run(frame.command);
			return;
		}
		case "dialog":
			answer(engines, socket, frame);
			return;
		case "ping":
			send(socket, { t: "pong" });
			return;
		default: {
			// Every client frame is handled above; a new one fails to compile here.
			const unhandled: never = frame;
			return unhandled;
		}
	}
};

const welcome = (socket: ChatSocket, frame: Extract<ClientFrame, { t: "hello" }>): void => {
	if (frame.protocol !== PROTOCOL_VERSION) {
		sendError(
			socket,
			"PROTOCOL_MISMATCH",
			`Server speaks protocol ${PROTOCOL_VERSION}, client sent ${frame.protocol}`,
		);
		return;
	}
	socket.data.tabId = frame.tabId;
	socket.data.welcomed = true;
	send(socket, { t: "welcome", protocol: PROTOCOL_VERSION });
};

/** Watch one session, building its engine once even if two frames ask at once. */
const watch = (
	engines: Engines,
	socket: ChatSocket,
	sessionId: string,
): Promise<Watchable | undefined> => {
	socket.data.wanted.add(sessionId);
	const attaching = socket.data.attaching.get(sessionId);
	if (attaching !== undefined) return attaching;
	if (socket.data.unsubscribes.has(sessionId)) return Promise.resolve(engines.find(sessionId));
	const task = open(engines, socket, sessionId).finally(() => {
		socket.data.attaching.delete(sessionId);
	});
	socket.data.attaching.set(sessionId, task);
	return task;
};

const open = async (
	engines: Engines,
	socket: ChatSocket,
	sessionId: string,
): Promise<Watchable | undefined> => {
	let session: Watchable;
	try {
		session = await engines.ensure(sessionId);
		// Another tab may have detached, and disposed this engine, while it was
		// being built. Rebuild from the session file instead of subscribing to it.
		if (!session.isOpen) session = await engines.ensure(sessionId);
	} catch (error) {
		sendError(
			socket,
			"AGENT_START_FAILED",
			error instanceof Error ? error.message : String(error),
			sessionId,
		);
		return undefined;
	}
	// The tab may have closed, or detached, while the engine was being built. The
	// registry hands the same session to every tab, and another one may already
	// watch it, so this tab only lets go: the session disposes itself after its
	// idle grace if nobody does.
	if (socket.data.closed || !socket.data.wanted.has(sessionId)) {
		session.release();
		return undefined;
	}
	socket.data.unsubscribes.set(
		sessionId,
		session.subscribe((out) => send(socket, out)),
	);
	return session;
};

/** Stop watching one session and leave the others alone. */
const unwatch = (socket: ChatSocket, sessionId: string): void => {
	socket.data.wanted.delete(sessionId);
	const unsubscribe = socket.data.unsubscribes.get(sessionId);
	if (unsubscribe === undefined) return;
	unsubscribe();
	socket.data.unsubscribes.delete(sessionId);
};

const answer = (
	engines: Engines,
	socket: ChatSocket,
	frame: Extract<ClientFrame, { t: "dialog" }>,
): void => {
	const session = engines.find(frame.sessionId);
	if (session === undefined) {
		sendError(socket, "SESSION_NOT_FOUND", "No live engine for this session", frame.sessionId);
		return;
	}
	// A stale answer is a race between two tabs, not an error: the dialog is
	// already settled, and the frame that closed it is on its way.
	if (session.answerDialog(frame.answer) === "mismatch") {
		sendError(
			socket,
			"UNSUPPORTED_FRAME",
			"That answer does not match the question it names",
			frame.sessionId,
		);
	}
};
