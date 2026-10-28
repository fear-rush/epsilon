# Architecture

Status: **partly implemented.** S1 to S3 are verified in a browser, S4 is built
with its palette unverified, and S12 has moved the engine into the server. The
browser socket is Epsilon's own protocol 4
([ADR-0009](adr/0009-socket-speaks-epsilon.md)); the engine runs in this process
([ADR-0008](adr/0008-embed-pi-engine-with-opinions.md)). The deployment boundary
is decided ([ADR-0005](adr/0005-deployment-owns-agent-home.md)). Modules named
below exist; later slices add the rest.

A map of the system: what the parts are, what each owns, and how a request or an
event travels. Rationale lives in [adr/](adr/); rules live in
[../AGENTS.md](../AGENTS.md); the socket contract lives in [protocol.md](protocol.md).

## Runtime shape

The dashed box is one deployment, and it is the isolation boundary. What is inside
it, including the agent home, belongs to it and not to the operator's host
([deploy.md](deploy.md)).

```
                    ┌──────────────────────── browser ────────────────────────┐
                    │  sidebar · transcript · composer                         │
                    └───────────┬─────────────────────────────┬───────────────┘
                                │ one WebSocket per tab        │ REST (disk reads)
                    ╭───────────┴─────────────────────────────┴───────────────╮
                    │  epsilon server                                          │
                    │                                                         │
                    │  ws/chat: handshake, attach, commands, dialogs           │
                    │  routes: session list and delete                         │
                    │           │                                              │
                    │  ┌────────▼─────────┐   ┌────────────────────────────┐   │
                    │  │ agent/registry   │   │ config.ts: home, project   │   │
                    │  │ one engine per   │   │ and the published PI_ home │   │
                    │  │ attached session │   └────────────────────────────┘   │
                    │  └────────┬─────────┘                                    │
                    │  ┌────────▼──────────────────────────────────────────┐   │
                    │  │ agent/engine: AgentSession in this process         │   │
                    │  │ loads extensions, skills, MCP and packages from    │   │
                    │  │ the agent home; ExtensionUIContext is a bridge     │   │
                    │  └────────┬──────────────────────────────────────────┘   │
                    │           │                                             │
                    │  ╭────────▼─────────╮  ╭─────────────────────────────╮    │
                    │  │ agent home        │  │ the project                 │    │
                    │  │ volume: settings, │  │ tools read, write and run   │    │
                    │  │ creds, packages,  │  │ commands here               │    │
                    │  │ sessions, trust   │  ╰─────────────────────────────╯    │
                    │  ╰──────────────────╯                                        │
                    ╰─────────────────────────────────────────────────────────╯
```

An engine is not a process. It shares the server's heap and its fate: an extension
or engine bug can take the server down, and the costs of that are accepted in
ADR-0008. Idle engines do not leak: the last tab to detach disposes the session,
and the next attach rebuilds it from pi's session file.

The agent home is resolved once, in `config.ts` (`EPSILON_AGENT_HOME`), published
as `PI_CODING_AGENT_DIR` for the reads pi performs itself, and passed to every
engine explicitly. An inherited value cannot choose this deployment's config. The
session list and delete read the same home the engines write to. The variable does
not cover everything pi reads: `~/.agents/skills` and the project's `.pi/` are
separate conventions, so a source run on a host still shares those with it.

The preview origin ([ADR-0003](adr/0003-preview-second-origin.md)) is decided and
not built; it becomes a second listener when S9 starts.

## Module map

`server/src/`: the host. Node-compatible, no browser code.

| Module               | Owns                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `index.ts`           | The Hono app and its generated OpenAPI document, exported for tests. No listener.          |
| `serve.ts`           | `Bun.serve` with `fetch` + `websocket`, and the shutdown hooks                             |
| `config.ts`          | Ports, paths, caps, env. The only place that reads `process.env`                           |
| `runtime.ts`         | The one engine registry, shared by the socket and the REST handlers                        |
| `agent/engine.ts`    | `createAgentSession`, the CLI built-ins, `ExtensionUIContext` bridge, JSON event transform |
| `agent/session.ts`   | One live session: commands, snapshot, engine events, dispose                               |
| `agent/dialogs.ts`   | Pending dialogs, keyed display state, unsupported TUI methods                              |
| `agent/registry.ts`  | sessionId → engine, creation dedupe, dispose when the last tab leaves                      |
| `agent/sessions.ts`  | pi's session-manager: the only path from REST to session files                             |
| `sessions/list.ts`   | Joining stored sessions with live engines, newest first                                    |
| `sessions/delete.ts` | Removing one session file, refused while an engine holds it                                |
| `ws/chat.ts`         | Socket upgrade state, hello, attach/detach, commands, dialog answers                       |
| `routes/*.ts`        | Thin handlers: validate, call one function, return                                         |

Not built yet, and named only so the slices stay findable: the Host check
(`security.ts`), file and diff routes, the readiness route (`GET /api/agent`), the
preview listener, the terminal pty, the resources page, notifications, and the
queue/backpressure channel.

`shared/src/`: browser-safe. No `node:*`, no React.

| Module                      | Owns                                                                     |
| --------------------------- | ------------------------------------------------------------------------ |
| `protocol/version.ts`       | `PROTOCOL_VERSION`                                                       |
| `protocol/frames.ts`        | zod schemas for every socket frame and the command union                 |
| `extui.ts`                  | zod schemas for dialog questions, answers and display requests           |
| `pi.ts`                     | Type-only re-export of pi's `JsonAgentSessionEvent`, the reducer's input |
| `conversation/state.ts`     | `ConversationState`                                                      |
| `conversation/reduce.ts`    | `reduce(state, frame)`: pure, replay-tested                              |
| `conversation/selectors.ts` | Derived views: messages, running tools, pending dialog, needs-input      |
| `conversation/tools.ts`     | zod schemas for tool arguments the renderers read                        |
| `conversation/fixtures/`    | Recorded event logs, one per hard case                                   |
| `schemas/sessions.ts`       | zod schemas for the REST session bodies                                  |

`client/src/`: React and Vite.

| Module                      | Owns                                                               |
| --------------------------- | ------------------------------------------------------------------ |
| `link.ts`                   | One socket, backoff, hello/welcome, attach/detach                  |
| `conversation/store.ts`     | `useSyncExternalStore` over `shared/conversation`, command senders |
| `hooks/use-conversation.ts` | One store per session per tab                                      |
| `routes/*.tsx`              | The home page and `/sessions/$sessionId`                           |
| `components/chat/`          | Transcript, markdown, tool trace, confirm and question dialogs     |
| `components/composer/`      | Input, palette, model and permission menus, `!cmd` and `/reload`   |
| `components/sessions/`      | The sidebar list                                                   |
| `components/ui/`            | shadcn primitives                                                  |
| `lib/`                      | Markdown, Shiki, formatting, permission modes                      |

## Data flows

**Open a session.** The id comes from the sidebar list or a new UUID → WS `attach`
→ the registry builds an engine, or reuses the live one → a snapshot from the
engine's own state, messages, models and commands → client replaces state → later
frames are deltas.

**Send a command.** `command { type: "prompt" }` → `LiveSession.run` →
`AgentSession.prompt` → pi emits session events → `toJsonEvent` → `event` frames →
the reducer. `steer`, `abort`, `bash`, `set_model` and `reload` map to one
`AgentSession` method each. `bash`, `set_model`, `reload` and a session rename
refresh the snapshot because they change what the snapshot reports.

**Answer an extension dialog.** The engine's `ExtensionUIContext.ask` blocks a tool
call → `agent/dialogs.ts` stores it and sends `dialog` → the client renders →
`dialog` answer back → the pending promise resolves. `abort` answers every pending
dialog as cancelled, and a dialog's own timeout does the same.

**Close and return.** The last `detach` on a session disposes its engine. The next
`attach` rebuilds it from pi's session file, which is why a closed tab loses a
running turn but not its transcript.

**Not ready.** Not built. The page has no readiness route yet, so a deployment
without credentials surfaces pi's own error as a notice after the first prompt.
ADR-0006 fixes what that state must look like: one notice naming the missing step,
the home path and the terminal command.

## State ownership

The deployment boundary owns the first two rows. Nothing outside it is read or
written unless the operator mounts it there
([ADR-0005](adr/0005-deployment-owns-agent-home.md)).

| State                                               | Owner                              | Lifetime                               |
| --------------------------------------------------- | ---------------------------------- | -------------------------------------- |
| Transcript, branches, compaction, session name      | pi's JSONL in the agent home       | Forever                                |
| Settings, credentials, models, MCP, packages, trust | the agent home (`$HOME/.pi/agent`) | Forever                                |
| Live engines                                        | `agent/registry.ts`                | Until the last tab detaches            |
| Unanswered extension dialogs, display state         | `agent/dialogs.ts`                 | Until answered, cancelled or timed out |
| Pins, archive, project order                        | not built                          | —                                      |
| View state, scroll position, drafts                 | Browser                            | Tab lifetime                           |

Nothing else is persisted. The agent home is not recorded anywhere: it is
deterministic, so a file naming it would be a second source of truth.

## Failure modes

| Failure                        | Behaviour                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Engine creation fails          | The socket answers `AGENT_START_FAILED`; the page shows it, never a blank session                                      |
| An extension handler throws    | The engine reports it through `onError`; the page shows `EXTENSION_ERROR`                                              |
| An engine bug crashes the host | Every live session dies with the server. Accepted in ADR-0008; the session files survive                               |
| Socket drops                   | Reconnect with backoff, `attach` again, a snapshot replaces state                                                      |
| Server restarts                | Same as a socket drop; in-flight turns are lost                                                                        |
| Protocol version mismatch      | `PROTOCOL_MISMATCH` → the page reloads                                                                                 |
| Agent home unconfigured        | Not built: pi's own error reaches the page as a notice                                                                 |
| No credential, no model        | The prompt's `command-result` or the engine's error names the problem; never a silent failed turn                      |
| Project not trusted            | pi skips project resources; the dashboard does not report it yet ([note](notes/2026-10-28-rpc-cannot-answer-trust.md)) |
| pi upgrade changes its surface | Types break at compile time first; re-verify against [reference/pi-rpc.md](reference/pi-rpc.md)                        |
| Extension uses TUI-only UI     | One warning per method names the terminal tab; never silence                                                           |

## Size budgets

| Area                       | Target                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `server/src/agent/`        | under 800 lines total                                                                          |
| `shared/src/conversation/` | under 500 lines                                                                                |
| `server/src/routes/`       | under 60 lines per file                                                                        |
| Any single file            | under 300 lines                                                                                |
| Client components          | one concept per file; if it needs more than ~10 state values, the state belongs in the reducer |
