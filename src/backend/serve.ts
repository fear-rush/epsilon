import { BunHttpServer } from "@effect/platform-bun";
import { Effect, FileSystem, Layer, Option, Path, type Types } from "effect";
import { Headers, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { type Rpc, type RpcGroup, RpcSerialization, RpcServer } from "effect/rpc";

import { EpsilonRpcs, SOCKET_PATH } from "#protocol/rpc";

import { EpsilonHandlersLive } from "./handlers.ts";
import { HandshakeGateLive, HandshakeLive, LaunchToken } from "./handshake.ts";

/**
 * The one listener: the page on this origin and one WebSocket beneath it.
 *
 * Everything here is about the browser boundary, not about a feature: the address is
 * loopback only, every request is checked against the `Host` and the socket also against
 * the `Origin`, and only a client that proved the launch token is answered
 * (12-gaps.md G3). A feature adds an RPC group in `handlers.ts`, never a route here.
 */

export type ServeConfig = {
	readonly port: number;
	/** Generated once per launch by `main.ts`; the served page carries it. */
	readonly token: string;
	/** `dist/app` when built, `src/app` for a server started from source. */
	readonly appDir: string;
	/**
	 * Vite's origin in dev, whose proxy carries the page's socket call to this server. A
	 * comma-separated list, because `localhost` and `127.0.0.1` are different origins.
	 */
	readonly devOrigin?: string | undefined;
};

/** The address `main.ts` binds; a remote mode with real authentication would sit here. */
export const HOSTNAME = "127.0.0.1";

/** The request's own path. `HttpServerRequest.url` is origin-less, so it needs a base. */
const requestUrl = (request: HttpServerRequest.HttpServerRequest): URL =>
	new URL(request.url, "http://localhost");

/** The marker `index.html` carries where the launch token goes. */
export const TOKEN_MARKER = "__EPSILON_TOKEN__";

const pageHeaders = {
	"content-security-policy":
		"default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'",
	"cross-origin-opener-policy": "same-origin",
	"referrer-policy": "no-referrer",
	"x-content-type-options": "nosniff",
} as const;

const hosts = (port: number): ReadonlyArray<string> => [
	`127.0.0.1:${port}`,
	`localhost:${port}`,
	`[::1]:${port}`,
];

const origins = (config: ServeConfig): ReadonlyArray<string> => {
	const dev = config.devOrigin === undefined ? [] : config.devOrigin.split(",");
	return [
		`http://127.0.0.1:${config.port}`,
		`http://localhost:${config.port}`,
		`http://[::1]:${config.port}`,
		...dev,
	];
};

/**
 * The `Host` check defeats DNS rebinding; the `Origin` check on the socket path stops a
 * page on another origin from using the upgrade. Both run before the route that upgrades,
 * which is why they are router middleware and not handler code.
 */
const guard =
	(config: ServeConfig) =>
	(
		effect: Effect.Effect<HttpServerResponse.HttpServerResponse, Types.unhandled>,
	): Effect.Effect<
		HttpServerResponse.HttpServerResponse,
		Types.unhandled,
		HttpServerRequest.HttpServerRequest
	> =>
		Effect.gen(function* () {
			const request = yield* HttpServerRequest.HttpServerRequest;
			const host = Option.getOrUndefined(Headers.get(request.headers, "host"));
			if (host === undefined || !hosts(config.port).includes(host)) {
				return HttpServerResponse.text("This server answers only on its own address.", {
					status: 421,
				});
			}
			if (requestUrl(request).pathname === SOCKET_PATH) {
				const origin = Option.getOrUndefined(Headers.get(request.headers, "origin"));
				if (origin === undefined || !origins(config).includes(origin)) {
					return HttpServerResponse.text("This socket answers only its own page.", {
						status: 403,
					});
				}
			}
			return yield* effect;
		});

/** The page served when the client has not been built: enough to prove the server runs. */
const placeholder = (token: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="epsilon-token" content="${token}" />
<title>Epsilon</title>
</head>
<body>
<main>
<h1>Epsilon is running</h1>
<p>The client has not been built yet. Run <code>bun run build</code>, or open the dev server.</p>
</main>
</body>
</html>
`;

/**
 * The served page carries the token; nothing else does, and only a page this server
 * served can read it. The path is used as received, without percent-decoding, so an
 * encoded `..` cannot reach a file outside the app directory.
 */
const page = (config: ServeConfig) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const request = yield* HttpServerRequest.HttpServerRequest;
		const requested = requestUrl(request).pathname;
		const relative = requested.endsWith("/") ? `${requested}index.html` : requested;

		// The document is served with this launch's token, so it is never a plain file.
		if (relative !== "/index.html") {
			const resolved = path.resolve(path.join(config.appDir, relative));
			const inside = resolved.startsWith(`${path.resolve(config.appDir)}${path.sep}`);
			const info = inside
				? yield* fs.stat(resolved).pipe(Effect.option)
				: Option.none<FileSystem.File.Info>();
			if (Option.isSome(info) && info.value.type === "File") {
				const response = yield* HttpServerResponse.file(resolved);
				return HttpServerResponse.setHeader(
					response,
					"cache-control",
					relative.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
				);
			}
		}

		const source = yield* fs
			.readFileString(path.join(config.appDir, "index.html"))
			.pipe(Effect.orElseSucceed(() => placeholder(config.token)));
		const html = source.replaceAll(TOKEN_MARKER, config.token);
		return HttpServerResponse.setHeaders(HttpServerResponse.html(html), {
			...pageHeaders,
			"cache-control": "no-cache",
		});
	});

/**
 * The browser boundary over one RPC group: the page, the health answer, the gate, and the
 * socket beneath the same origin. It is a function of the group and its handlers so a test
 * can serve a smaller vocabulary over the real listener (see `serve.test.ts`).
 */
export const BoundaryLive = <Rpcs extends Rpc.Any, E, R>(
	config: ServeConfig,
	group: RpcGroup.RpcGroup<Rpcs>,
	handlers: Layer.Layer<Rpc.ToHandler<Rpcs>, E, R>,
) =>
	Layer.mergeAll(
		HttpRouter.add(
			"GET",
			"/api/health",
			Effect.succeed(HttpServerResponse.text("ok")).pipe(
				Effect.map(HttpServerResponse.setHeader("cache-control", "no-store")),
			),
		),
		HttpRouter.add("GET", "/*", page(config)),
		RpcServer.layerHttp({ group, path: SOCKET_PATH, protocol: "websocket" }),
		HttpRouter.use((router) => router.addGlobalMiddleware(guard(config))),
	).pipe(
		Layer.provide(handlers),
		Layer.provide(HandshakeGateLive),
		Layer.provide(HandshakeLive),
		Layer.provide(Layer.succeed(LaunchToken, config.token)),
	);

/**
 * Everything the page needs to run, as one layer.
 *
 * The socket is a router route, not an upgrade handed to another protocol, because Bun's
 * `serve` owns the connection and cannot hand it over (13-verified, item 10).
 */
export const ServeLive = (config: ServeConfig) =>
	HttpRouter.serve(BoundaryLive(config, EpsilonRpcs, EpsilonHandlersLive)).pipe(
		Layer.provide(RpcSerialization.layerJson),
		Layer.provide(BunHttpServer.layer({ hostname: HOSTNAME, port: config.port })),
	);
