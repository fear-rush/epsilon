import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BunHttpServer, BunServices, BunSocket } from "@effect/platform-bun";
import { Effect, Layer, Schema, type Scope } from "effect";
import { HttpRouter } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";

import { ReadinessRpcs } from "#protocol/config/readiness";
import { HandshakeRefused } from "#protocol/errors";
import { HandshakeGate } from "#protocol/handshake";
import { type Hello, HandshakeRpcs, PROTOCOL_VERSION, SOCKET_PATH } from "#protocol/rpc";

import { testPaths } from "../../test/setup.ts";
import { ProvidersStoreLive } from "./config/providers/store.ts";
import { ReadinessHandlersLive } from "./config/readiness/handlers.ts";
import { ReadinessServiceLive } from "./config/readiness/service.ts";
import { HandshakeHandlersLive } from "./handshake.ts";
import { AgentHomeLive } from "./platform/agent-home.ts";
import { JsonDocumentLive } from "./platform/json-document.ts";
import { LogLive } from "./platform/log.ts";
import { PiConfigLive } from "./platform/pi.ts";
import { BoundaryLive, HOSTNAME, TOKEN_MARKER } from "./serve.ts";

/**
 * The browser boundary over a real listener: the page, the health answer, the `Host` and
 * `Origin` checks, and the handshake that opens the socket.
 *
 * The vocabulary is deliberately small (the handshake and readiness) so the test starts
 * the real router and protocol without building every configuration feature. The full
 * group is wired in `handlers.ts`; what is proven here is the boundary itself, which is
 * where G3 lives.
 */

const token = "test-launch-token";

/** The group this file serves, gated exactly as `handlers.ts` gates the real one. */
const group = HandshakeRpcs.merge(ReadinessRpcs).middleware(HandshakeGate);

/** A port the OS just gave out, so the `Host` check and the listener agree. */
const freePort = (): number => {
	const probe = Bun.serve({ port: 0, fetch: () => new Response("") });
	const port = probe.port;
	void probe.stop(true);
	if (port === undefined) throw new Error("Bun did not name the probe server's port");
	return port;
};

const boundary = (name: string) => {
	const agentDir = join(testPaths.scratch, `serve-${name}`);
	const appDir = join(testPaths.scratch, `serve-app-${name}`);
	mkdirSync(join(agentDir, ".epsilon"), { recursive: true });
	mkdirSync(join(appDir, "assets"), { recursive: true });
	writeFileSync(
		join(appDir, "index.html"),
		`<!doctype html><meta name="epsilon-token" content="${TOKEN_MARKER}" />`,
	);
	writeFileSync(join(appDir, "assets", "app.css"), "body{}");
	const port = freePort();

	const platform = Layer.mergeAll(LogLive, JsonDocumentLive).pipe(
		Layer.provideMerge(AgentHomeLive(agentDir, testPaths.sandboxHome)),
		Layer.provideMerge(BunServices.layer),
	);
	const pi = PiConfigLive.pipe(Layer.provideMerge(platform));
	const providers = ProvidersStoreLive.pipe(Layer.provideMerge(platform));
	const readiness = ReadinessServiceLive.pipe(
		Layer.provideMerge(pi),
		Layer.provideMerge(providers),
	);

	const handlers = Layer.mergeAll(HandshakeHandlersLive, ReadinessHandlersLive);
	const layer = HttpRouter.serve(BoundaryLive({ appDir, port, token }, group, handlers)).pipe(
		Layer.provide(readiness),
		Layer.provide(RpcSerialization.layerJson),
		Layer.provide(BunHttpServer.layer({ hostname: HOSTNAME, port })),
	);

	return { agentDir, layer, port };
};

/** Runs the body with the listener scoped to it, so the port is free afterwards. */
const withServer = <A, E, E2>(
	layer: Layer.Layer<never, E>,
	body: () => Effect.Effect<A, E2, Scope.Scope>,
): Effect.Effect<A, E | E2> =>
	Effect.scoped(
		Effect.gen(function* () {
			yield* Layer.build(layer);
			return yield* body();
		}),
	);

/**
 * The client lives only as long as the body that provides this layer: the protocol's read
 * loop is forked into the layer's scope, so providing the layer around `RpcClient.make`
 * alone would close the socket before the first call.
 */
const clientLayer = (port: number) =>
	RpcClient.layerProtocolSocket().pipe(
		Layer.provideMerge(
			BunSocket.layerWebSocket(`ws://127.0.0.1:${port}${SOCKET_PATH}`, {
				headers: { origin: `http://127.0.0.1:${port}` },
			}),
		),
		Layer.provideMerge(RpcSerialization.layerJson),
	);

const refusal = (error: { readonly _tag: string }): HandshakeRefused =>
	error instanceof HandshakeRefused ? error : Schema.decodeUnknownSync(HandshakeRefused)(error);

describe("serve", () => {
	test("answers health on its own host and refuses any other", async () => {
		const { layer, port } = boundary("host");
		await Effect.runPromise(
			withServer(layer, () =>
				Effect.gen(function* () {
					const ok = yield* Effect.promise(() => fetch(`http://127.0.0.1:${port}/api/health`));
					expect(ok.status).toBe(200);
					expect(yield* Effect.promise(() => ok.text())).toBe("ok");

					const wrong = yield* Effect.promise(() =>
						fetch(`http://127.0.0.1:${port}/api/health`, {
							headers: { host: `evil.example:${port}` },
						}),
					);
					expect(wrong.status).toBe(421);
				}),
			),
		);
	}, 10_000);

	test("serves the page with this launch's token and its security headers", async () => {
		const { layer, port } = boundary("page");
		await Effect.runPromise(
			withServer(layer, () =>
				Effect.gen(function* () {
					const page = yield* Effect.promise(() => fetch(`http://127.0.0.1:${port}/`));
					expect(page.status).toBe(200);
					expect(page.headers.get("content-security-policy")).toContain("default-src 'self'");
					expect(page.headers.get("x-content-type-options")).toBe("nosniff");
					expect(page.headers.get("cache-control")).toBe("no-cache");
					expect(yield* Effect.promise(() => page.text())).toContain(`content="${token}"`);

					const asset = yield* Effect.promise(() =>
						fetch(`http://127.0.0.1:${port}/assets/app.css`),
					);
					expect(asset.status).toBe(200);
					expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
				}),
			),
		);
	}, 10_000);

	test("refuses the socket from another origin", async () => {
		const { layer, port } = boundary("origin");
		await Effect.runPromise(
			withServer(layer, () =>
				Effect.gen(function* () {
					const wrong = yield* Effect.promise(() =>
						fetch(`http://127.0.0.1:${port}${SOCKET_PATH}`, {
							headers: { origin: "http://evil.example" },
						}),
					);
					expect(wrong.status).toBe(403);
				}),
			),
		);
	}, 10_000);

	test("opens on the right token and version, and answers a call afterwards", async () => {
		const { agentDir, layer, port } = boundary("handshake");
		await Effect.runPromise(
			withServer(layer, () =>
				Effect.gen(function* () {
					const client = yield* RpcClient.make(group);
					const welcome = yield* client.handshake({ version: PROTOCOL_VERSION, token });
					expect(welcome.version).toBe(PROTOCOL_VERSION);
					expect(welcome.agentHome).toBe(agentDir);
					const readiness = yield* client["config.readiness.read"]();
					expect(readiness.ready).toBe(false);
				}).pipe(Effect.provide(clientLayer(port))),
			),
		);
	}, 10_000);

	test("refuses a wrong token and version, and answers nothing before a handshake", async () => {
		const { layer, port } = boundary("refusals");
		await Effect.runPromise(
			withServer(layer, () =>
				Effect.gen(function* () {
					// One connection per case: the gate opens a connection, not a client, and a
					// refusal must not open it for anything else on that socket.
					const refuseHandshake = (hello: Hello) =>
						Effect.gen(function* () {
							const client = yield* RpcClient.make(group);
							return yield* Effect.flip(client.handshake(hello));
						}).pipe(Effect.provide(clientLayer(port)));

					const wrongToken = yield* refuseHandshake({
						version: PROTOCOL_VERSION,
						token: "another-launch",
					});
					expect(refusal(wrongToken).reason).toBe("token");

					const wrongVersion = yield* refuseHandshake({ token, version: "0" });
					expect(refusal(wrongVersion).reason).toBe("version");

					const unopened = yield* Effect.gen(function* () {
						const client = yield* RpcClient.make(group);
						return yield* Effect.flip(client["config.readiness.read"]());
					}).pipe(Effect.provide(clientLayer(port)));
					expect(refusal(unopened).reason).toBe("unopened");
				}),
			),
		);
	}, 10_000);
});
