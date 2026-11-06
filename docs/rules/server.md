# Server rules

Server, engine and runtime code. Pinned to `effect` 4.1.x. On an Effect upgrade, re-check
the names these rules pin: the `RpcSerialization` presets, `RpcServer.layerProtocolWebsocket`,
the `RcMap` options, the `PlatformError` reason tags, `Schema.StructWithRest`,
`Schema.toStandardSchemaV1` and the timeout operators.

## Adding a feature

### SV-1 · One name across the roots

Do: run the check the change calls for ([testing.md](testing.md)) and show every failure in the UI; put a rule both sides run in `src/domain/<name>/rules.ts`, the schema in
`src/protocol/<name>.ts`, the handler in `src/backend/<name>/`, the UI in
`src/app/features/<name>/`; use the same `<name>` in all three and in the route.
Don't: name the same feature differently per root.
Enforced by: review

## Services

### SV-2 · A service is a class plus its layer, every operation `Effect.fn`

Do: `Context.Service<Self, Shape>()("epsilon/Name")`, its `Layer` in the same file, `Effect.fn("Catalog.list")` on each operation.
Don't: write an anonymous generator body for an operation.
Enforced by: review

### SV-3 · Layers are named `<Service>Live`

Do: run the `Live` layers in tests against the temp home from `test/setup.ts`; swap with `Layer.succeed(Service, value)` only where a test needs a fixed answer.
Don't: stub a service where the real layer runs against the temp home.
Enforced by: review

### SV-4 · Reach other features through their service

Do: import another feature's service or index.
Don't: import its internals.
Enforced by: epsilon/no-feature-internals

### SV-5 · The owning service wraps its dependency

Do: use `platform/files.ts` for `node:fs` and `platform/pi.ts` for pi's exporters.
Don't: import those modules, `node:fs` or `node:child_process` from anywhere else in `src/backend` or `src/engine`.
Enforced by: epsilon/effect-only-io

## Effects

### SV-6 · Generators by default

Do: `Effect.gen(function* () { ... })` for more than one step; `pipe` for short transformations and cross-cutting operators (`Effect.timeout`, `Effect.retry`, `Effect.withSpan`) at the end.
Don't: nest long chains in `pipe`.
Enforced by: review

### SV-7 · Only the edges run effects

Do: run effects in `src/backend/main.ts`, `src/engine/main.ts`, `src/app/core/runtime.ts` and tests.
Don't: call `Effect.runPromise` inside a service.
Enforced by: review

### SV-8 · A Promise API is wrapped once

Do: `Effect.tryPromise({ try, catch })` in the service that owns the dependency, mapped to a tagged error.
Don't: `Effect.promise` for something that can reject; `throw`, `try`/`catch`, `new Promise`, `.then`/`.catch` in `src/backend/**` or `src/engine/**` outside `platform/`, `engine/main.ts`, `backend/main.ts` and `sessions/ingest.ts`.
Enforced by: epsilon/effect-only-io

### SV-9 · Anything with a close is scoped

Do: `Effect.acquireRelease(spawn, (child) => child.shutdown)`; long-lived background work is `forkScoped`.
Don't: `const child = spawn(); void child.kill()`; `forkDetach`.
Enforced by: review

### SV-10 · State and concurrency are explicit

Do: state in `Ref` or `SynchronizedRef`; per-key exclusion as a `Semaphore` in an `RcMap`; `{ concurrency: 4 }` on every `Effect.all`/`forEach` over a collection.
Don't: `Effect.all(items)` unbounded.
Enforced by: review

## Errors

### SV-11 · Expected failure is a tagged error

Do: `Schema.TaggedError<Self>()("Name", { fields })`, named `<Thing><Problem>` (`SessionNotFound`, `EngineStopped`), actionable data in the fields; message text lives in the client's `errorView`.
Don't: put message text in the error.
Enforced by: review

### SV-12 · Recover by tag; bugs are defects

Do: `Effect.catchTag`, `catchTags`, `catchReason` (nested platform reasons); a fallback logs `Effect.logWarning` and, if the operator could notice it, attaches a notice; a bug is a defect (`Effect.die`, `Effect.orDie`), logged with a span and shown as one generic notice, never a raw message.
Don't: `catchAll(() => Effect.succeed(undefined))`, or any `catchAll` to a default without a log.
Enforced by: review

### SV-13 · A wire error is declared in the protocol

Do: declare it in `src/protocol/`; the client's `errorView` union derives from that module, so the client build breaks until the error has words.
Don't: add a wire error without words.
Enforced by: tsc

## Time

### SV-14 · Time comes from Effect

Do: `Effect.sleep`, `Effect.timeout`, `Effect.timeoutOrElse`, `Schedule`, `Clock.currentTimeMillis`.
Don't: `Date.now`, `setTimeout`, `setInterval` outside `platform/`.
Enforced by: epsilon/effect-only-io

### SV-15 · Use the v4 timeout operators

Do: `Effect.timeout` (fails with `TimeoutError`) or `Effect.timeoutOrElse`.
Don't: `Effect.timeoutFail`, which does not exist in v4; bound a test under `TestClock` with an Effect operator (every Effect timer is virtual there; use Bun's per-test timeout).
Enforced by: tsc

## Schema

### SV-16 · One `Schema.Struct` per wire shape

Do: derive types with `typeof X.Type`; `z.discriminatedUnion` becomes `Schema.Union` of `Schema.TaggedStruct`.
Don't: write a duplicate interface by hand.
Enforced by: review

### SV-17 · Keep unknown keys with `StructWithRest`

Do: `Schema.StructWithRest(Struct, [Schema.Record(Schema.String, Schema.Unknown)])` in `JsonDocument`; `onExcessProperty` is `"ignore"` or `"error"` only.
Don't: drop keys the schema does not name when writing a file you do not own.
Enforced by: review

### SV-18 · Bytes and forms

Do: bytes over the socket as `Schema.Uint8ArrayFromBase64`, or the whole socket on `RpcSerialization.layerSchemaBinary`; client forms take `Schema.toStandardSchemaV1(schema)`.
Don't: send raw bytes in a JSON field.
Enforced by: review

## The React boundary

### SV-19 · Components do not import Effect

Do: import only types from `effect` in components; `src/app/core/runtime.ts` holds the one `ManagedRuntime`, the socket `RpcClient`, the reconnect `Schedule` and the hooks that turn effects into Promises and Streams; the conversation store stays `useSyncExternalStore` fed by the attach stream, and the reducer stays a pure function in `src/domain/`.
Don't: import a value from `effect` in a component.
Enforced by: review

## Not covered here

Anything these rules do not name: stop and ask.
