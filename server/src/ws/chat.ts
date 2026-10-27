/**
 * The browser socket: version handshake, attach/detach, rpc passthrough and
 * dialog answers. The contract is docs/protocol.md; frames are parsed with the
 * shared zod schemas, never with a parallel copy.
 *
 * One connection may watch several sessions. Frames carry their own
 * `sessionId`, so there is no ambient "current session".
 */
import { PROTOCOL_VERSION, clientFrameSchema, serverFrameSchema } from "shared";
import type { ClientFrame, ProtocolErrorCode, ServerFrame } from "shared";
import type { ServerWebSocket } from "bun";

import type { SessionRegistry } from "../agent/registry";

/** What one browser tab is: its id, whether it said hello, the sessions it watches. */
export type ChatState = {
	tabId: string;
	welcomed: boolean;
	/** One unsubscribe per watched session. A tab may watch several at once. */
	unsubscribes: Map<string, () => void>;
};

export type ChatSocket = ServerWebSocket<ChatState>;

const SERVER_VERSION = "0.0.0";

const send = (socket: ChatSocket, frame: ServerFrame): void => {
	socket.send(JSON.stringify(serverFrameSchema.parse(frame)));
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
};

export const handleClose = (socket: ChatSocket): void => {
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
	route(registry, socket, frame);
};

const issuesOf = (parsed: ReturnType<typeof clientFrameSchema.safeParse>): string =>
	parsed.success ? "" : parsed.error.issues.map((issue) => issue.message).join("; ");

const parseFrame = (raw: string): ReturnType<typeof clientFrameSchema.safeParse> | undefined => {
	try {
		return clientFrameSchema.safeParse(JSON.parse(raw));
	} catch {
		return undefined;
	}
};

const route = (registry: SessionRegistry, socket: ChatSocket, frame: ClientFrame): void => {
	switch (frame.t) {
		case "hello":
			welcome(socket, frame);
			return;
		case "attach":
			watch(registry, socket, frame.sessionId);
			return;
		case "detach":
			unwatch(socket, frame.sessionId);
			return;
		case "rpc":
			watch(registry, socket, frame.sessionId);
			runCommand(registry, socket, frame);
			return;
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
	send(socket, { t: "welcome", protocol: PROTOCOL_VERSION, serverVersion: SERVER_VERSION });
};

/** Watch one session. Repeating the same attach does not stack a second sink. */
const watch = (registry: SessionRegistry, socket: ChatSocket, sessionId: string): void => {
	if (socket.data.unsubscribes.has(sessionId)) return;
	const session = registry.ensure(sessionId);
	socket.data.unsubscribes.set(
		sessionId,
		session.subscribe((out) => send(socket, out)),
	);
};

/** Stop watching one session and leave the others alone. */
const unwatch = (socket: ChatSocket, sessionId: string): void => {
	const unsubscribe = socket.data.unsubscribes.get(sessionId);
	if (unsubscribe === undefined) return;
	unsubscribe();
	socket.data.unsubscribes.delete(sessionId);
};

const runCommand = (
	registry: SessionRegistry,
	socket: ChatSocket,
	frame: Extract<ClientFrame, { t: "rpc" }>,
): void => {
	try {
		registry.ensure(frame.sessionId).send(frame.command);
	} catch (error) {
		sendError(
			socket,
			"CHILD_EXITED",
			error instanceof Error ? error.message : "The agent is gone",
			frame.sessionId,
		);
	}
};

const answer = (
	registry: SessionRegistry,
	socket: ChatSocket,
	frame: Extract<ClientFrame, { t: "dialog" }>,
): void => {
	const session = registry.find(frame.sessionId);
	if (session === undefined) {
		sendError(socket, "SESSION_NOT_FOUND", "No live agent for this session", frame.sessionId);
		return;
	}
	session.answerDialog(frame.answer);
};
