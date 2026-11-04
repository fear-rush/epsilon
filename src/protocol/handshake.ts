import { RpcMiddleware } from "effect/rpc";

import { HandshakeRefused } from "./errors.ts";

/**
 * The gate on every call except the handshake itself.
 *
 * It is declared here, with the group it guards, because both ends must agree on the
 * error it can answer: a client that did not know `HandshakeRefused` could not decode the
 * refusal. Only the server provides an implementation (`backend/handshake.ts`).
 */
export class HandshakeGate extends RpcMiddleware.Service<HandshakeGate>()("epsilon/HandshakeGate", {
	error: HandshakeRefused,
}) {}
