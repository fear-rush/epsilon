import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { HandshakeRefused } from "./errors.ts";

/** One socket, one path, declared once. */
export const SOCKET_PATH = "/api/link";

/**
 * The wire version the page and the engine must agree on.
 *
 * It is bumped by hand whenever a frame or command changes shape, and a test fails when a
 * frame tag exists that this list does not name: adding a frame without bumping is the
 * mistake that would otherwise reach a stale tab. A schema hash was the plan's first idea;
 * Effect 4.1 has no stable JSON-schema writer, so the explicit list is the version.
 */
export const PROTOCOL_VERSION = "3";

export const frameTags = [
	"snapshot",
	"prepend",
	"append",
	"streaming",
	"streamingEnd",
	"toolDelta",
	"notice",
	"dialog",
	"dialogClosed",
	"busy",
	"drift",
	"sessionMeta",
	"tree",
] as const;

/** The first call on the socket: the client's version and the launch token. */
export const Hello = Schema.Struct({
	version: Schema.String,
	token: Schema.String,
});
export type Hello = typeof Hello.Type;

export const Welcome = Schema.Struct({
	version: Schema.String,
	/** The agent home this server runs, so the page can say which one it shows. */
	agentHome: Schema.String,
});
export type Welcome = typeof Welcome.Type;

/**
 * The opening call.
 *
 * Nothing else on the socket is answered before it: the launch token in `Hello` is
 * readable only by a page the server itself served, so a socket that never sent it is
 * refused every call (12-gaps.md G3).
 */
export const HandshakeRpcs = RpcGroup.make(
	Rpc.make("handshake", { payload: Hello, success: Welcome, error: HandshakeRefused }),
);
