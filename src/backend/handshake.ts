import { Context, Effect, HashSet, Layer, Ref } from "effect";
import { RpcMiddleware } from "effect/rpc";

import { HandshakeRefused } from "#protocol/errors";
import { HandshakeRpcs, type Hello, PROTOCOL_VERSION, type Welcome } from "#protocol/rpc";

import { AgentHome } from "./platform/agent-home.ts";

/**
 * Who may use the socket.
 *
 * A browser page on another origin can open this socket, so the first call proves the
 * page was served by this launch: `Hello` carries the token that `main.ts` generated and
 * wrote into the page it served. The gate refuses every other call from a client that has
 * not opened, which is what makes a socket with a wrong token useless rather than merely
 * unwelcome (12-gaps.md G3).
 */

/** The token this launch put in the served page, generated once in `main.ts`. */
export class LaunchToken extends Context.Service<LaunchToken, string>()("epsilon/LaunchToken") {}

export type HandshakeApi = {
	readonly open: (clientId: number, hello: Hello) => Effect.Effect<Welcome, HandshakeRefused>;
	readonly isOpen: (clientId: number) => Effect.Effect<boolean>;
};

export class Handshake extends Context.Service<Handshake, HandshakeApi>()("epsilon/Handshake") {}

export const HandshakeLive = Layer.effect(
	Handshake,
	Effect.gen(function* () {
		const token = yield* LaunchToken;
		const home = yield* AgentHome;
		const opened = yield* Ref.make(HashSet.empty<number>());

		const isOpen = Effect.fn("Handshake.isOpen")(function* (clientId: number) {
			return HashSet.has(yield* Ref.get(opened), clientId);
		});

		const open = Effect.fn("Handshake.open")(function* (clientId: number, hello: Hello) {
			if (hello.version !== PROTOCOL_VERSION) {
				return yield* new HandshakeRefused({ reason: "version" });
			}
			if (hello.token !== token) return yield* new HandshakeRefused({ reason: "token" });
			yield* Ref.update(opened, HashSet.add(clientId));
			return { version: PROTOCOL_VERSION, agentHome: home.agentDir };
		});

		return { isOpen, open };
	}),
);

/** The gate on every call except the handshake itself. */
export class HandshakeGate extends RpcMiddleware.Service<HandshakeGate>()("epsilon/HandshakeGate", {
	error: HandshakeRefused,
}) {}

export const HandshakeGateLive = Layer.effect(
	HandshakeGate,
	Effect.gen(function* () {
		const handshake = yield* Handshake;
		return (effect, options) =>
			Effect.gen(function* () {
				if (options.rpc._tag === "handshake") return yield* effect;
				if (!(yield* handshake.isOpen(options.client.id))) {
					return yield* new HandshakeRefused({ reason: "unopened" });
				}
				return yield* effect;
			});
	}),
);

export const HandshakeHandlersLive = HandshakeRpcs.toLayer(
	Effect.gen(function* () {
		const handshake = yield* Handshake;
		return {
			handshake: (hello: Hello, options: { readonly client: { readonly id: number } }) =>
				handshake.open(options.client.id, hello),
		};
	}),
);
