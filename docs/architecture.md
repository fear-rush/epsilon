# Architecture

Status: **partly implemented.** The socket, the driver and the transcript page
exist; nothing lists the sessions on disk yet. See [plan.md](plan.md) for the
slice in progress rather than a status here.

A map of the system: what the parts are, what each owns, and how a request or an
event travels. Rationale lives in [adr/](adr/); rules live in
[../AGENTS.md](../AGENTS.md); the socket contract lives in
[protocol.md](protocol.md).

## Runtime shape

```
                    ┌──────────────────────── browser ────────────────────────┐
                    │  sidebar · transcript · composer · files · preview      │
                    └───────────┬─────────────────────────────┬───────────────┘
                                │ one WebSocket per tab        │ REST (disk reads)
                    ┌───────────▼───────────────┐  ┌──────────▼────────────────┐
                    │ ws/hub → ws/channel       │  │ http/routes → sessions/,  │
                    │ per-session ordering,     │  │ files/, git, resources,   │
                    │ coalescing, backpressure  │  │ ui-state                  │
                    └───────────┬───────────────┘  └──────────┬────────────────┘
                                │                             │
                    ┌───────────▼───────────────┐  ┌──────────▼────────────────┐
                    │ agent/pool                │  │ pi's SessionManager +     │
                    │ agent/driver (stdin/stdout │ │ plain fs reads            │
                    │ JSONL) → agent/normalize  │ │ ~/.pi/agent/sessions/**   │
                    └───────────┬───────────────┘  └───────────────────────────┘
                                │
                    ┌───────────▼───────────────┐
                    │ pi --mode rpc  (one child │  loads extensions, skills,
                    │ per live session, capped) │  MCP, packages from ~/.pi
                    └───────────┬───────────────┘
                                │
                    ┌───────────▼───────────────┐   ┌───────────────────────────┐
                    │ tool execution: files,    │   │ preview origin (:preview) │
                    │ shell, codemode in the    │   │ sandboxed static + proxy  │
                    │ project directory         │   └───────────────────────────┘
                    └───────────────────────────┘
```

The preview origin is a **second listener**, on its own port, serving agent-written
content. It never shares an origin with the API (ADR-0003).

## Module map

`server/src/`: the host. Node-compatible, no browser code.

| Module               | Owns                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------- |
| `index.ts`           | The Hono app, exported for tests. No listener.                                         |
| `serve.ts`           | `Bun.serve` with `fetch` + `websocket`, plus the preview listener, plus shutdown hooks |
| `config.ts`          | Ports, paths, caps, env. The only place that reads `process.env`                       |
| `security.ts`        | Loopback and Host checks, optional token                                               |
| `agent/driver.ts`    | Spawning `pi --mode rpc`, JSONL framing, `send`, `onFrame`, `onExit`, `kill`           |
| `agent/pool.ts`      | sessionId → child, cap, LRU, idle kill, idle-gated restart                             |
| `agent/normalize.ts` | `JsonAgentSessionEvent` → protocol frames. The only place that knows pi's event shapes |
| `agent/extui.ts`     | The nine dialog methods, pending-request replay, cancel on abort                       |
| `ws/upgrade.ts`      | Socket upgrade, origin check, tab identity                                             |
| `ws/hub.ts`          | Attach/detach, per-session channel registry, meta fan-out                              |
| `ws/channel.ts`      | Per-session ordering, delta coalescing, backpressure limits                            |
| `sessions/reader.ts` | Reading a session file through pi's session-manager helpers                            |
| `sessions/list.ts`   | Grouping by project, running and needs-input joins                                     |
| `sessions/search.ts` | Transcript search                                                                      |
| `sessions/fork.ts`   | Copying a branch into a new session file                                               |
| `routes/*.ts`        | Thin handlers: validate, call one function, return                                     |
| `preview/*.ts`       | Second-origin serving, CSP, dev-server proxy                                           |
| `terminal.ts`        | Pty sessions for the terminal tab                                                      |
| `state/ui.ts`        | `~/.epsilon/ui-state.json`: pins, archive, project order                               |
| `notify.ts`          | Needs-input and turn-end notifications                                                 |

`shared/src/`: browser-safe. No `node:*`, no React.

| Module                      | Owns                                                                    |
| --------------------------- | ----------------------------------------------------------------------- |
| `protocol/version.ts`       | `PROTOCOL_VERSION`                                                      |
| `protocol/frames.ts`        | zod schemas for every socket frame                                      |
| `conversation/state.ts`     | `ConversationState`                                                     |
| `conversation/reduce.ts`    | `reduce(state, frame)`: pure, replay-tested                             |
| `conversation/selectors.ts` | Derived views: messages, running tools, pending dialog, needs-input     |
| `conversation/fixtures/`    | Recorded event logs, one per hard case                                  |
| `pi.ts`                     | Type-only re-exports from pi (`RpcCommand`, `JsonAgentSessionEvent`, …) |
| `schemas/*.ts`              | zod schemas for REST bodies and responses                               |

`client/src/`: React and Vite.

| Module                                                            | Owns                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `link.ts`                                                         | One socket, backoff, hello/welcome, attach/detach                |
| `conversation/store.ts`                                           | `useSyncExternalStore` over `shared/conversation`                |
| `conversation/commands.ts`                                        | Typed senders for the 33 RPC commands                            |
| `routes/*.tsx`                                                    | URL state: new session, session, resources                       |
| `components/chat/`                                                | Transcript, entry-kind map, per-tool renderers, generic fallback |
| `components/composer/`                                            | Input, palette, model and reasoning pickers, queue, bash box     |
| `components/dialogs/`                                             | The nine extension dialog methods                                |
| `components/{sidebar,files,settings,terminal,preview,resources}/` | Each surface                                                     |
| `lib/`                                                            | Markdown, Shiki, formatting                                      |

## Data flows

**Open a session.** REST `GET /sessions/{id}` for the file record → WS `attach` →
server ensures a child → snapshot from `get_state`, `get_messages`, `get_commands`,
`get_session_stats` → client replaces state → later frames are deltas.

**Send a prompt.** Client sends `rpc { prompt }` → driver writes JSON → pi streams
`message_*` and `tool_execution_*` events → normalizer → channel → client reducer.

**Answer an extension dialog.** `extension_ui_request` in → extui stores it with a
deadline and sends `dialog` → client renders → `dialog` answer back → driver
writes `extension_ui_response`. A late-attaching tab gets pending requests in its
snapshot.

**Read a file.** REST `GET /files?type=read` → allow-list check (realpath inside a
project or worktree root) → bytes → client viewer.

**Preview.** REST `GET /preview/targets` lists candidate files and listening
ports → iframe points at the second origin with a sandbox and no
`allow-same-origin`.

**Restart a session's agent.** WS `rpc`-adjacent pool action, idle-gated → kill the
child → next `attach` spawns a new one, which re-reads extensions, skills, MCP and
packages.

## State ownership

| State                                                 | Owner                      | Lifetime                               |
| ----------------------------------------------------- | -------------------------- | -------------------------------------- |
| Transcript, branches, compaction, session name        | pi's JSONL files           | Forever                                |
| Extension/server config, models, MCP config, packages | `~/.pi/**`                 | Forever                                |
| Pins, archive, project order                          | `~/.epsilon/ui-state.json` | Until deleted                          |
| Live child processes                                  | `agent/pool.ts`            | Idle timeout                           |
| Unanswered extension dialogs                          | `agent/extui.ts`           | Until answered, cancelled or timed out |
| View state, scroll position, drafts                   | Browser                    | Tab lifetime                           |

Nothing else is persisted. If a piece of state is not in this table, it does not
exist.

## Failure modes

| Failure                            | Behaviour                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Child crashes mid-turn             | Client sees the stream stop; the turn is lost; the next prompt spawns a fresh child. Show it, do not silently reconnect |
| Socket drops                       | Reconnect with backoff, `attach` again, snapshot replaces state                                                         |
| Server restarts                    | Same as socket drop; in-flight turns are lost (ADR-0001)                                                                |
| Protocol version mismatch          | `PROTOCOL_MISMATCH` → client reloads                                                                                    |
| pi upgrade changes the RPC surface | Types break at compile time first; re-verify against [reference/pi-rpc.md](reference/pi-rpc.md)                         |
| Preview content misbehaves         | It cannot reach the API: different origin, sandboxed frame, closed CORS                                                 |

## Size budgets

| Area                       | Target                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `server/src/agent/`        | under 800 lines total                                                                          |
| `shared/src/conversation/` | under 500 lines                                                                                |
| `server/src/routes/`       | under 60 lines per file                                                                        |
| Any single file            | under 300 lines                                                                                |
| Client components          | one concept per file; if it needs more than ~10 state values, the state belongs in the reducer |
