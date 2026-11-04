import {
	Context,
	Deferred,
	Effect,
	Fiber,
	Layer,
	ManagedRuntime,
	Option,
	Queue,
	Ref,
	Semaphore,
	Stream,
} from "effect";
import { RpcClient, RpcClientError, RpcSerialization } from "effect/rpc";
import { Socket } from "effect/socket";

import { HandshakeRefused } from "#protocol/errors";
import { EpsilonRpcs, PROTOCOL_VERSION, SOCKET_PATH, type Welcome } from "#protocol/rpc";

import { PageOutOfDate, ServerUnreachable } from "./errors.ts";
import { queryClient } from "./query-client.ts";

/**
 * The page's one connection to its server.
 *
 * A component never touches the socket: it calls `call`, which waits for an open
 * connection, proves the launch token once per connection, and runs the procedure. A call
 * made while the socket is closed waits for the next open (up to `OPEN_WAIT`), which is
 * what keeps a typed command from vanishing during a reconnect; past the deadline it is
 * refused with `ServerUnreachable` so the page can say so.
 *
 * The protocol reconnects on its own: `layerProtocolSocket` retries a dropped socket and
 * dials a new WebSocket for each attempt, so a new connection is a new server-side client
 * id and therefore a new handshake.
 */

export type LinkStatus = "connecting" | "open" | "closed";

type LinkSnapshot = {
	readonly socket: LinkStatus;
	/** The server refused this page's token or version; only a reload fixes it. */
	readonly outOfDate: boolean;
};

let snapshot: LinkSnapshot = { socket: "connecting", outOfDate: false };
const listeners = new Set<() => void>();

const publish = (next: Partial<LinkSnapshot>): void => {
	snapshot = { ...snapshot, ...next };
	for (const listener of listeners) listener();
};

/** The connection as the health banner reads it. */
export const link = {
	subscribe: (listener: () => void): (() => void) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	},
	current: (): LinkSnapshot => snapshot,
};

/** How long a call waits for a reconnect before it is refused. */
const OPEN_WAIT = "10 seconds";

/** The marker `serve.ts` replaces in the page it serves; a stale page keeps it. */
const TOKEN_MARKER = "__EPSILON_TOKEN__";

/**
 * The launch token the server wrote into this page. A page served by anything else has no
 * token, and its handshake is refused, which the banner reports as an out-of-date page.
 */
const launchToken = (): string => {
	const meta = document.querySelector('meta[name="epsilon-token"]');
	const content = meta?.getAttribute("content");
	return content === undefined || content === null || content === TOKEN_MARKER ? "" : content;
};

const socketUrl = (): string =>
	`${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}${SOCKET_PATH}`;

/** `unopened` only means the connection changed under a call, so it is worth one retry. */
const isUnopened = (error: Error): boolean =>
	error instanceof HandshakeRefused && error.reason === "unopened";

/** The two failures the link itself adds to a call. */
type LinkFailure = ServerUnreachable | PageOutOfDate;

/** Why a page cannot use this connection, said in the app's own words. */
const linkFailure = (refused: HandshakeRefused): LinkFailure => {
	if (refused.reason === "unopened") return new ServerUnreachable({ waited: false });
	publish({ outOfDate: true });
	return new PageOutOfDate({ reason: refused.reason === "version" ? "version" : "token" });
};

/**
 * Folds the protocol's two failures into the link's, leaving a feature's own refusal
 * untouched. The error type is `unknown` on purpose: a page shows a refused answer in the
 * feature's words and the connection in the banner's, and the wire's tagged errors are
 * decoded but not enumerated at every call site.
 */
const normalize = <A>(effect: Effect.Effect<A, Error>): Effect.Effect<A, Error> =>
	Effect.mapError(effect, (error) => {
		if (error instanceof HandshakeRefused) return linkFailure(error);
		if (error instanceof RpcClientError.RpcClientError) {
			return new ServerUnreachable({ waited: false });
		}
		return error;
	});

/** What the connection knows: whether the socket is open, and which connection it is. */
type ConnectionApi = {
	/** Runs when the protocol opens a socket. */
	readonly opened: Effect.Effect<void>;
	/** Runs when a socket is dropped, before the protocol retries. */
	readonly closed: Effect.Effect<void>;
	/** Waits for the socket to open, then gives up after `OPEN_WAIT`. */
	readonly waitOpen: Effect.Effect<void, ServerUnreachable>;
	/** Resolves once per open, for work that belongs to each connection. */
	readonly connect: Effect.Effect<void>;
	/** Increments on every open, so a handshake can tell it is still current. */
	readonly generation: Effect.Effect<number>;
};

class Connection extends Context.Service<Connection, ConnectionApi>()("epsilon/app/Connection") {}

const makeConnection = Effect.gen(function* () {
	// The gate is pending while the socket is closed and done while it is open.
	const gate = yield* Ref.make(yield* Deferred.make<void>());
	const generation = yield* Ref.make(0);
	const connects = yield* Queue.unbounded<void>();

	const opened = Effect.gen(function* () {
		yield* Ref.update(generation, (current) => current + 1);
		yield* Deferred.succeed(yield* Ref.get(gate), undefined).pipe(Effect.ignore);
		yield* Effect.sync(() => publish({ socket: "open" }));
		yield* Queue.offer(connects, undefined);
	});

	const closed = Effect.gen(function* () {
		yield* Ref.set(gate, yield* Deferred.make<void>());
		yield* Effect.sync(() => publish({ socket: "closed" }));
	});

	const waitOpen = Effect.gen(function* () {
		yield* Deferred.await(yield* Ref.get(gate)).pipe(Effect.timeout(OPEN_WAIT));
	}).pipe(
		Effect.catchTag("TimeoutError", () => Effect.fail(new ServerUnreachable({ waited: true }))),
	);

	return {
		opened,
		closed,
		waitOpen,
		connect: Queue.take(connects),
		generation: Ref.get(generation),
	};
});

const ConnectionLive = Layer.effect(Connection, makeConnection);

/** The client the whole page shares, typed by the same group the server serves. */
export type Api = RpcClient.FromGroup<
	typeof EpsilonRpcs,
	HandshakeRefused | RpcClientError.RpcClientError
>;

class Rpc extends Context.Service<Rpc, Api>()("epsilon/app/Rpc") {}

const RpcLive = Layer.effect(Rpc, RpcClient.make(EpsilonRpcs));

/** What the app asks of the link: run a call, or say where the agent home is. */
type LinkApi = {
	/** Runs one procedure, waiting for a connection and proving the token first. */
	readonly run: <A>(select: (client: Api) => Effect.Effect<A, Error>) => Effect.Effect<A, Error>;
	/** The handshake's answer, waiting for it to run; none when the page was refused. */
	readonly welcome: Effect.Effect<Option.Option<Welcome>>;
	/** One subscription, waiting for a connection and proving the token before it runs. */
	readonly stream: <A>(
		select: (client: Api) => Stream.Stream<A, Error>,
		onItem: (item: A) => void,
	) => Effect.Effect<void, Error>;
};

class Link extends Context.Service<Link, LinkApi>()("epsilon/app/Link") {}

const makeLink = Effect.gen(function* () {
	const client = yield* Rpc;
	const connection = yield* Connection;
	// -1 is "never handshaken": a generation of 0 means the socket has not opened yet,
	// and treating the two as equal would skip the handshake on the first call.
	const handshakenAt = yield* Ref.make(-1);
	const welcome = yield* Ref.make(Option.none<Welcome>());
	const permit = yield* Semaphore.make(1);

	// An `unopened` answer is a race with a reconnect, not a verdict on the page: the
	// socket is open, so the handshake is simply not on this connection yet.
	const retryUnopened = <A, E extends Error>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
		Effect.retry(
			effect.pipe(
				Effect.tapError((error) => (isUnopened(error) ? Ref.set(handshakenAt, 0) : Effect.void)),
			),
			{ times: 1, while: isUnopened },
		);

	const handshake = normalize(
		client.handshake({ version: PROTOCOL_VERSION, token: launchToken() }).pipe(
			Effect.tap((answer) =>
				Effect.gen(function* () {
					yield* Ref.set(welcome, Option.some(answer));
					yield* Ref.set(handshakenAt, yield* connection.generation);
				}),
			),
			retryUnopened,
		),
	);

	const ready = Effect.suspend(() =>
		Effect.gen(function* () {
			const current = yield* connection.generation;
			if ((yield* Ref.get(handshakenAt)) === current) return;
			yield* connection.waitOpen;
			yield* permit.withPermit(
				Effect.gen(function* () {
					if ((yield* Ref.get(handshakenAt)) === current) return;
					yield* handshake;
				}),
			);
		}),
	);

	const stream = <A>(select: (client: Api) => Stream.Stream<A, Error>, onItem: (item: A) => void) =>
		normalize(
			Effect.gen(function* () {
				yield* ready;
				yield* Stream.runForEach(select(client), (item) => Effect.sync(() => onItem(item)));
			}),
		);

	const run = <A>(select: (client: Api) => Effect.Effect<A, Error>) =>
		normalize(
			Effect.gen(function* () {
				yield* ready;
				return yield* select(client);
			}).pipe(retryUnopened),
		);

	// Proving the token happens as soon as a connection opens, so the banner clears and
	// the agent home is known before the first page asks. A refusal is already published.
	yield* Effect.forkScoped(
		Effect.forever(
			Effect.gen(function* () {
				yield* connection.connect;
				yield* ready.pipe(Effect.ignore);
				yield* Effect.promise(() => queryClient.invalidateQueries());
			}),
		),
	);

	return {
		run,
		stream,
		welcome: ready.pipe(Effect.ignore, Effect.andThen(Ref.get(welcome))),
	};
});

const LinkLive = Layer.effect(Link, makeLink);

/**
 * Runs one procedure and hands the answer back as a promise.
 *
 * The procedure keeps its declared error type; the link folds a dropped socket into
 * `ServerUnreachable` and a refused handshake into `PageOutOfDate`, so a page never has
 * to know about the protocol.
 */
export const call = <A>(
	select: (client: Api) => Effect.Effect<A, Error>,
	options?: Effect.RunOptions,
): Promise<A> =>
	runtime.runPromise(
		Effect.gen(function* () {
			const established = yield* Link;
			return yield* established.run(select);
		}),
		options,
	);

/** One subscription attempt, for a caller that builds its own attempt per connection. */
export const runStream = <A>(
	select: (client: Api) => Stream.Stream<A, Error>,
	onItem: (item: A) => void,
): Effect.Effect<void, Error, Link> =>
	Effect.flatMap(Link, (established) => established.stream(select, onItem));

/**
 * Runs an attempt, and re-runs it for as long as the connection is what failed.
 *
 * A dropped socket ends the server's stream; the next attempt waits for the next open and
 * proves the token again. A failure the engine named (a stopped chat, a refused command)
 * is not retried: it is the answer, and reattaching would start a new process. The
 * returned function stops the subscription and its server-side stream.
 */
export const keepSubscribed = (
	attempt: () => Effect.Effect<void, Error, Link>,
	onEnd?: (error: Error | undefined) => void,
): (() => void) => {
	const fiber = runtime.runFork(
		Effect.gen(function* () {
			for (;;) {
				const result = yield* Effect.result(attempt());
				if (result._tag === "Success") {
					onEnd?.(undefined);
					return;
				}
				if (!(result.failure instanceof ServerUnreachable)) {
					onEnd?.(result.failure);
					return;
				}
				// A refused write can arrive while the socket still reads as open; the pause
				// keeps that from becoming a spin instead of a reconnect.
				yield* Effect.sleep("250 millis");
			}
		}),
	);
	return () => {
		void runtime.runPromise(Fiber.interrupt(fiber));
	};
};

/** The agent home this server runs, once the handshake has answered. */
export const agentHome = (): Promise<string | undefined> =>
	runtime.runPromise(
		Effect.gen(function* () {
			const established = yield* Link;
			const welcome = yield* established.welcome;
			return Option.getOrUndefined(Option.map(welcome, (value) => value.agentHome));
		}),
	);

const ConnectionHooksLive = Layer.effect(
	RpcClient.ConnectionHooks,
	Effect.gen(function* () {
		const connection = yield* Connection;
		return { onConnect: connection.opened, onDisconnect: connection.closed };
	}),
);

const protocolLayer = RpcClient.layerProtocolSocket({
	// A stopped server must show in the status line while the reader is still looking. A
	// live idle socket answers pings, so the timeout only measures silence.
	pingInterval: "1 second",
	pingTimeout: "2 seconds",
}).pipe(
	Layer.provide(
		Socket.layerWebSocket(socketUrl()).pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal)),
	),
	Layer.provide(RpcSerialization.layerJson),
	Layer.provide(ConnectionHooksLive),
);

const clientLayer = RpcLive.pipe(Layer.provide(protocolLayer), Layer.provide(ConnectionLive));

const appLayer = LinkLive.pipe(Layer.provide(clientLayer), Layer.provide(ConnectionLive));

const runtime = ManagedRuntime.make(appLayer);
