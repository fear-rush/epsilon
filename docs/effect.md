# Effect style

How Epsilon writes Effect code. The decisions behind it are in
[DECISIONS.md](DECISIONS.md); the API names here were checked against the pinned
`effect` 4.1.x. On an Effect upgrade, re-check the names this file pins: the
`RpcSerialization` presets, `RpcServer.layerProtocolWebsocket`, the `RcMap` options, the
`PlatformError` reason tags, `Schema.StructWithRest`, `Schema.toStandardSchemaV1` and the
timeout operators.

## Services

A service is a class plus its layer in the same file, and every operation is
`Effect.fn`, so each span names itself:

```ts
export class Catalog extends Context.Service<Catalog, CatalogShape>()("epsilon/Catalog") {}

export const CatalogLive = Layer.effect(
	Catalog,
	Effect.gen(function* () {
		/* ... */
	}),
);
```

- Name the layer `<Service>Live`. Tests run the `Live` layers against the temp home from
  `test/setup.ts`, and swap a service with `Layer.succeed(Service, value)` only where a
  test needs a fixed answer.
- A feature may import another feature's service, never its internals
  (`epsilon/no-feature-internals`).
- Services own their dependency: `platform/files.ts` wraps `node:fs`, `pi.ts` wraps
  pi's exporters, and nothing else imports those modules.

## Effects

- Generators by default: `Effect.gen(function* () { ... })` for anything with more than
  one step. `pipe` for short transformations and for cross-cutting operators
  (`Effect.timeout`, `Effect.retry`, `Effect.withSpan`) applied at the end.
- No `Effect.runPromise` inside services. Only `src/backend/main.ts`,
  `src/engine/main.ts`, `src/app/core/runtime.ts` and tests run effects.
- A Promise API is wrapped once, with `Effect.tryPromise({ try, catch })`, in the
  service that owns the dependency, and mapped to a tagged error. Never
  `Effect.promise` for something that can reject.
- Anything with a close is `acquireRelease`. Long-lived background work is
  `forkScoped`; never `forkDetach`.
- State is `Ref` or `SynchronizedRef`. Per-key exclusion is a `Semaphore` in an
  `RcMap`. Every `Effect.all`/`forEach` over a collection states `{ concurrency: n }`.

## Errors

- Expected failure is a `Schema.TaggedError<Self>()("Name", { fields })`. Name it
  `<Thing><Problem>` (`SessionNotFound`, `EngineStopped`) and put actionable data in the
  fields. Message text lives in the client's `errorView`, not in the error.
- Recover with `Effect.catchTag`, `catchTags`, `catchReason` (nested platform reasons).
  Never `catchAll` to a default without a log.
- A fallback logs `Effect.logWarning` and, if the operator could notice it, attaches a
  notice.
- Bugs are defects: `Effect.die` or `Effect.orDie`. They are logged with a span and
  shown as one generic notice.
- A wire error is declared in `src/protocol/` and handled exhaustively by the client's
  `errorView`, so adding one breaks the client build until it is shown. Not yet true:
  `errorView` still has a generic fallback; [plan/02-feedback.md](plan/02-feedback.md)
  makes it exhaustive.

## Time

- `Effect.sleep`, `Effect.timeout`, `Effect.timeoutOrElse`, `Schedule`, and
  `Clock.currentTimeMillis`. Never `Date.now`, `setTimeout` or `setInterval` outside
  `platform/` (`epsilon/effect-only-io`).
- `Effect.timeoutFail` does not exist in v4. Product code uses `Effect.timeout` (fails
  with `TimeoutError`) or `Effect.timeoutOrElse`.
- Under `TestClock` every Effect timer is virtual, including timeouts. A test's hard
  bound is Bun's per-test timeout, not an Effect operator.

## Schema

- One `Schema.Struct` per wire shape; derive types with `typeof X.Type`. No
  hand-written duplicate interfaces.
- `z.object` → `Schema.Struct`; `z.discriminatedUnion` → `Schema.Union` of
  `Schema.TaggedStruct`.
- Keeping unknown keys (`JsonDocument`): `Schema.StructWithRest(Struct, [Schema.Record(
  Schema.String, Schema.Unknown)])`. `onExcessProperty` has only `"ignore"` and
  `"error"`.
- Bytes over the socket: `Schema.Uint8ArrayFromBase64`, or the whole socket on
  `RpcSerialization.layerSchemaBinary`.
- Client forms take `Schema.toStandardSchemaV1(schema)`.

## The React boundary

- Components never import from `effect` except types.
- `src/app/core/runtime.ts` holds the one `ManagedRuntime`, the socket `RpcClient`, the
  reconnect `Schedule` and the hooks that turn effects into Promises and Streams.
- The conversation store stays `useSyncExternalStore`, fed by the attach stream. The
  reducer stays a pure function in `src/domain/`.

## Do / don't

| Do                                                                                         | Don't                                             |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `yield* Effect.tryPromise({ try, catch: (cause) => new FileUnreadable({ path, cause }) })` | `yield* Effect.promise(() => readFile(path))`     |
| `Effect.acquireRelease(spawn, (child) => child.shutdown)`                                  | `const child = spawn(); void child.kill()`        |
| `yield* Effect.sleep("2 seconds")`                                                         | `yield* Effect.tryPromise(() => Bun.sleep(2000))` |
| `catchTag("SessionNotFound", () => ...)`                                                   | `catchAll(() => Effect.succeed(undefined))`       |
| `Effect.fn("Catalog.list")` for each operation                                             | an anonymous generator body                       |
| `{ concurrency: 4 }` on a fan-out                                                          | `Effect.all(items)` unbounded                     |
