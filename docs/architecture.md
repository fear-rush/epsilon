# Architecture

Status: **partly implemented.** The socket, the driver, the transcript page and
the session list exist. The deployment boundary and the explicit agent home are
decided and not built ([ADR-0005](adr/0005-deployment-owns-agent-home.md)). pi's
engine runs outside our process, as a child
([ADR-0007](adr/0007-embed-pi-engine.md) records why). See [plan.md](plan.md) for the
slice in progress rather than a status here.

A map of the system: what the parts are, what each owns, and how a request or an
event travels. Rationale lives in [adr/](adr/); rules live in
[../AGENTS.md](../AGENTS.md); the socket contract lives in
[protocol.md](protocol.md).

## Runtime shape

The dashed box is one deployment, and it is the isolation boundary. What is inside
it, including the agent home, belongs to it and not to the operator's host
([deploy.md](deploy.md)).

```
                    ┌──────────────────────── browser ────────────────────────┐
                    │  sidebar · transcript · composer · files · preview       │
                    └───────────┬─────────────────────────────┬───────────────┘
                                │ one WebSocket per tab        │ REST (disk reads)
                    ╭───────────┴─────────────────────────────┴───────────────╮
                    │  epsilon server (also serves the built client)          │
                    │                                                         │
                    │  ┌──────────────────┐  ┌────────────────────────────┐   │
                    │  │ ws/hub → channel │  │ http/routes → sessions/,   │   │
                    │  │ per-session       │  │ files/, agent, ui-state    │   │
                    │  │ ordering, cache    │  └────────────┬───────────────┘   │
                    │  └────────┬─────────┘               │                   │
                    │           │                         │                   │
                    │  ┌────────▼─────────┐   ┌───────────▼───────────────┐   │
                    │  │ agent/registry    │   │ agent/home: which config  │   │
                    │  │ cap, idle kill    │   │ dir, is it ready, what is │   │
                    │  └────────┬─────────┘   │ missing                   │   │
                    │           │             └───────────────────────────┘   │
                    │  ┌────────▼──────────────────────────────────────────┐  │
                    │  │ pi --mode rpc (one child per live session, capped) │  │
                    │  │ loads extensions, skills, MCP, packages from the   │  │
                    │  │ agent home (ADR-0001, ADR-0004)                    │  │
                    │  └────────┬──────────────────────────────────────────┘  │
                    │           │                                             │
                    │  ╭────────▼─────────╮  ╭─────────────────────────────╮    │
                    │  │ agent home        │  │ the project (bind mount)    │    │
                    │  │ volume: settings, │  │ tools read, write and run   │    │
                    │  │ creds, packages,  │  │ commands here               │    │
                    │  │ sessions, trust   │  ╰─────────────────────────────╯    │
                    │  ╰──────────────────╯                                        │
                    ╰────────────────────────────┬────────────────────────────╯
                                                 │ second listener, own port
                                     ┌───────────▼───────────┐
                                     │ preview origin        │
                                     │ sandboxed static +    │
                                     │ dev-server proxy      │
                                     └───────────────────────┘
```

The preview origin is a **second listener**, on its own port, serving agent-written
content. It never shares an origin with the API (ADR-0003).

The agent home is resolved once, in `config.ts` (`EPSILON_AGENT_HOME`), published
as `PI_CODING_AGENT_DIR` for the server's own pi calls, and given to every child
explicitly, so an inherited value cannot choose this deployment's config. The
session list and delete have to read the same home the children write to, which is
why the choice is published rather than only passed along. It is pi's own default path inside the deployment
unless the override says otherwise ([ADR-0005](adr/0005-deployment-owns-agent-home.md)).
The variable does not cover everything pi reads: `~/.agents/skills` and the
project's `.pi/` are separate conventions, so a source run on a host still shares
those with it.

## Module map

`server/src/`: the host. Node-compatible, no browser code.

| Module               | Owns                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------- |
| `index.ts`           | The Hono app and its generated OpenAPI document, exported for tests. No listener.      |
| `runtime.ts`         | The one live-child registry, shared by the socket and the REST handlers                |
| `serve.ts`           | `Bun.serve` with `fetch` + `websocket`, plus the preview listener, plus shutdown hooks |
| `config.ts`          | Ports, paths, caps, env. The only place that reads `process.env`                       |
| `security.ts`        | Loopback and Host checks, optional token                                               |
| `agent/driver.ts`    | Spawning `pi --mode rpc`, JSONL framing, `send`, `onFrame`, `onExit`, `kill`           |
| `agent/sessions.ts`  | pi's session-manager: the only path from REST to session files                         |
| `agent/registry.ts`  | sessionId → child, cap, idle kill, idle-gated restart                                  |
| `agent/home.ts`      | Reading the agent home: ready or not, which provider is configured, what is missing    |
| `agent/normalize.ts` | `JsonAgentSessionEvent` → protocol frames. The only place that knows pi's event shapes |
| `agent/extui.ts`     | The nine dialog methods, pending-request replay, cancel on abort                       |
| `ws/upgrade.ts`      | Socket upgrade, origin check, tab identity                                             |
| `ws/hub.ts`          | Attach/detach, per-session channel registry, meta fan-out                              |
| `ws/channel.ts`      | Per-session ordering, delta coalescing, backpressure limits                            |
| `sessions/reader.ts` | Reading a session file through pi's session-manager helpers                            |
| `sessions/list.ts`   | Joining stored sessions with live children, newest first                               |
| `sessions/delete.ts` | Removing one session file, refused while a child holds it                              |
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

**Open a session.** The id comes from `GET /api/sessions` → WS `attach` → server
ensures a child → snapshot from `get_state`, `get_messages` and
`get_available_models` → client replaces state → later frames are deltas. REST lives under `/api` and `/sessions/<id>` is
a client route, so a reload is not swallowed by the dev proxy.

**Send a prompt.** Client sends `rpc { prompt }` → the driver writes it to the agent
host → pi streams `message_*` and `tool_execution_*` events → normalizer → channel
→ client reducer.

**Not ready.** Any page load asks for the agent home's state (REST `GET /api/agent`)
→ if a step is missing, the page shows one notice naming the step, the home path and
the command that fixes it in a terminal inside the deployment
([ADR-0006](adr/0006-setup-in-the-deployment-terminal.md)). The dashboard writes
nothing to pi's configuration.

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

The deployment boundary owns the first two rows. Nothing outside it is read or
written unless the operator mounts it there
([ADR-0005](adr/0005-deployment-owns-agent-home.md)).

| State                                               | Owner                              | Lifetime                               |
| --------------------------------------------------- | ---------------------------------- | -------------------------------------- |
| Transcript, branches, compaction, session name      | pi's JSONL in the agent home       | Forever                                |
| Settings, credentials, models, MCP, packages, trust | the agent home (`$HOME/.pi/agent`) | Forever                                |
| Pins, archive, project order                        | `~/.epsilon/ui-state.json`         | Until deleted                          |
| Live child processes                                | `agent/registry.ts`                | Idle timeout                           |
| Unanswered extension dialogs                        | `agent/extui.ts`                   | Until answered, cancelled or timed out |
| View state, scroll position, drafts                 | Browser                            | Tab lifetime                           |

Nothing else is persisted. If a piece of state is not in this table, it does not
exist. The agent home is not recorded anywhere: it is deterministic, so a file
naming it would be a second source of truth.

## Failure modes

| Failure                        | Behaviour                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Agent process crashes mid-turn | Client sees the stream stop; the turn is lost; the next prompt spawns a fresh one. Show it, do not silently reconnect |
| Socket drops                   | Reconnect with backoff, `attach` again, snapshot replaces state                                                       |
| Server restarts                | Same as socket drop; in-flight turns are lost (ADR-0001)                                                              |
| Protocol version mismatch      | `PROTOCOL_MISMATCH` → client reloads                                                                                  |
| Agent home unconfigured        | Every page names the missing step and the terminal command that fixes it (ADR-0006)                                   |
| No credential, no model        | The prompt is refused with a message naming the fix, never a silent failed turn                                       |
| Project not trusted            | Project resources are skipped by pi; the dashboard reports it, because RPC cannot ask (note)                          |
| pi upgrade changes its surface | Types break at compile time first; re-verify against [reference/pi-rpc.md](reference/pi-rpc.md)                       |
| Preview content misbehaves     | It cannot reach the API: different origin, sandboxed frame, closed CORS                                               |

## Size budgets

| Area                       | Target                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `server/src/agent/`        | under 800 lines total                                                                          |
| `shared/src/conversation/` | under 500 lines                                                                                |
| `server/src/routes/`       | under 60 lines per file                                                                        |
| Any single file            | under 300 lines                                                                                |
| Client components          | one concept per file; if it needs more than ~10 state values, the state belongs in the reducer |
