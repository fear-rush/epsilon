/**
 * The browser socket: version handshake, attach/detach, commands and dialog
 * answers. The contract is docs/protocol.md; frames are parsed with the shared
 * zod schemas, never with a parallel copy.
 *
 * One connection may watch several sessions. Frames carry their own
 * `sessionId`, so there is no ambient "current session".
 */
import { PROTOCOL_VERSION, clientFrameSchema, serverFrameSchema } from "shared";
import type { ClientFrame, ProtocolErrorCode, ServerFrame } from "shared";
import type { ServerWebSocket } from "bun";

import type { SessionRegistry } from "../agent/registry";
import type { LiveSession } from "../agent/session";

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
	attaching: Map<string, Promise<LiveSession | undefined>>;
};

export type ChatSocket = ServerWebSocket<ChatState>;

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

export const handleMessage = (registry: SessionRegistry, socket: ChatSocket, raw: string): void => {
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
	void route(registry, socket, frame);
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

const route = async (
	registry: SessionRegistry,
	socket: ChatSocket,
	frame: ClientFrame,
): Promise<void> => {
	switch (frame.t) {
		case "hello":
			welcome(socket, frame);
			return;
		case "attach":
			await watch(registry, socket, frame.sessionId);
			return;
		case "detach":
			unwatch(socket, frame.sessionId);
			return;
		case "command": {
			const session = await watch(registry, socket, frame.sessionId);
			await session?.run(frame.command);
			return;
		}
		case "dialog":
			answer(registry, socket, frame);
			return;
		case "ping":
			send(socket, { t: "pong" });
			return;
		default:
			sendError(
				socket,
				"UNSUPPORTED_FRAME",
				`Frame "${frame.t}" is not implemented at protocol ${PROTOCOL_VERSION}`,
			);
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
	registry: SessionRegistry,
	socket: ChatSocket,
	sessionId: string,
): Promise<LiveSession | undefined> => {
	socket.data.wanted.add(sessionId);
	const attaching = socket.data.attaching.get(sessionId);
	if (attaching !== undefined) return attaching;
	if (socket.data.unsubscribes.has(sessionId)) return Promise.resolve(registry.find(sessionId));
	const task = open(registry, socket, sessionId).finally(() => {
		socket.data.attaching.delete(sessionId);
	});
	socket.data.attaching.set(sessionId, task);
	return task;
};

const open = async (
	registry: SessionRegistry,
	socket: ChatSocket,
	sessionId: string,
): Promise<LiveSession | undefined> => {
	let session: LiveSession;
	try {
		session = await registry.ensure(sessionId);
		// Another tab may have detached, and disposed this engine, while it was
		// being built. Rebuild from the session file instead of subscribing to it.
		if (!session.isOpen) session = await registry.ensure(sessionId);
	} catch (error) {
		sendError(
			socket,
			"AGENT_START_FAILED",
			error instanceof Error ? error.message : String(error),
			sessionId,
		);
		return undefined;
	}
	// The tab may have closed, or detached, while the engine was being built.
	if (socket.data.closed || !socket.data.wanted.has(sessionId)) {
		session.dispose();
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
	registry: SessionRegistry,
	socket: ChatSocket,
	frame: Extract<ClientFrame, { t: "dialog" }>,
): void => {
	const session = registry.find(frame.sessionId);
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
