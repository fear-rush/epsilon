# Map

What exists and how it connects. No rules here; rules are in [rules/](rules/server.md).

## Runtime shape

```
Browser tab ──one WebSocket (Effect RPC)──▶ epsilon   (Bun, one port, one process)
                                             ├─ serves dist/app
                                             ├─ catalog (in process) ── <home>/.epsilon/session-index.sqlite
                                             └─ supervisor ──Bun IPC──▶ engine, one per live chat
                                                                         (pi's AgentSessionRuntime + extensions)
```

| Process   | Owns                                                                                                                                    | Never does                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `epsilon` | Socket, configuration, catalog reads, supervisor, the page                                                                              | Import pi's runtime; run extension code |
| Catalog   | Runs inside `epsilon`: the index's one write connection, the fs watch, the stat sweep, and a build sliced so the socket keeps answering | Write session files                     |
| Engine    | One `AgentSessionRuntime`, its extensions, dialogs, frames                                                                              | Talk to the browser; outlive `epsilon`  |

- One crash, freeze or leak costs one chat. The chat restarts from its JSONL, which is the
  truth. The index is derived: delete it and nothing is lost.
- A folder can move its session files with pi's `sessionDir` setting. The catalog reads
  pi's answer for the home's chat folder and for every folder its rows name, and reconciles
  those.
- A cold build on a real home is seconds of parsing; the loop hands control back in slices,
  so the socket answers during it and the longest stall is tens of milliseconds.
- In dev, Vite serves the UI with HMR and proxies the one socket to the server; the
  server's own port redirects to Vite. In production `bun run start` is one process serving
  the built page and the socket.

## Roots

| Root            | Holds                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/protocol/` | Effect Schema for every wire shape, the RPC group, an explicit `PROTOCOL_VERSION` checked against the frame list, errors both sides see          |
| `src/domain/`   | Pure rules both sides run: the conversation reducer, its state and selectors, MCP, provider and skill rules                                      |
| `src/backend/`  | Sockets, the session index, the settings features, the supervisor of live chats, and `platform/` (the pi, filesystem, process, clock boundaries) |
| `src/engine/`   | The child process: embeds pi, bridges extension UI, speaks one tagged message set over Bun IPC                                                   |
| `src/app/`      | React, Vite, Tailwind, shadcn. `core/` is runtime, router, queries, errors, status line; `features/` mirrors the server's names                  |

Boundaries are checked twice: tsconfig project references for what may type-check
together, and `no-restricted-imports` per root. On the page the features root is
`src/app/features`; on the server it is `src/backend`, whose composition root is the files
beside the feature folders.

## Inside a server feature

| File          | Holds                                                                       |
| ------------- | --------------------------------------------------------------------------- |
| `service.ts`  | `Effect.fn` operations, typed errors                                        |
| `handlers.ts` | The RPC handlers, which only compose the service                            |
| `store.ts`    | File reads and writes through pi's exporters or `JsonDocument`, when needed |
| `rules.ts`    | Pure logic worth testing alone                                              |

The schema is `src/protocol/<name>.ts`, shared with the page. IO goes through `platform/`.
The client mirrors it: `features/<name>/` with a query hook, a form and a view, built from
the shared patterns.

## Request flow (configuration)

1. A component calls a typed function from `src/app/core/runtime.ts`.
2. `RpcClient` encodes the payload with the protocol schema and sends it on the socket.
3. The server handler decodes it again, runs the service, and returns the schema'd value or
   a declared tagged error.
4. The client renders the value, or maps the error through `errorView`.
5. A write invalidates through a pushed stream (`settings.changes`, `sessions.changes`). A
   provider sign-in streams on `settings.providers.login`; a reloaded page reads
   `loginState` and attaches to the running flow.

## Live chat flow

1. The page attaches: `conversation.attach` returns a stream of frames.
2. The registry reuses the engine for that session or asks the supervisor to spawn one in
   a scope; the engine builds its runtime from the session file. A chat whose folder is
   gone is gated by the page (the list carries `cwdMissing`); an engine started on such a
   folder stops at start.
3. The engine reports ready once the session exists, before pi's extensions finish
   `session_start`. Commands wait for the binding; a failed bind refuses them with the
   reason and a notice.
4. The engine sends a windowed snapshot (entry ids, recent entries, notices); older pages
   arrive when the transcript asks. A chat pi cannot total skips the readings with a
   notice. The flat tree arrives when the picker or jump rail asks. The composer's readings
   follow the snapshot and again when pi's numbers change; extension statuses travel as a
   `statuses` frame.
5. Commands go down the same socket as tagged values; extension dialogs come back as frames
   and their answers as commands. A question asked before a tab attaches is replayed when
   it does. A prompt starting with a name in the built-in table is answered by the engine
   before pi.
6. The reducer in `src/domain/` turns frames into state; a state-only resync replaces the
   transcript without replaying frames.
7. A crash sends `EngineStopped` to that chat's tabs only; the next command respawns.

## Where state lives

| State                                           | Truth                                                 |
| ----------------------------------------------- | ----------------------------------------------------- |
| Sessions, transcript, tree                      | pi's JSONL on disk                                    |
| Where those files live                          | pi's `sessionDir`; the catalog follows it             |
| Session list, pins, renames                     | The SQLite index (derived) and `pinned-sessions.json` |
| Providers, models, MCP, skills, packages, trust | pi's documented files                                 |
| Epsilon settings (`maxRunning`, …)              | `<home>/.epsilon/settings.json`                       |
| Open chats, engine processes, fibers            | Scopes in the server process                          |
| Transcript, draft, scroll anchor                | The browser tab                                       |
