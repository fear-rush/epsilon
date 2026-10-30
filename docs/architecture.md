# Architecture

Status: **partly implemented.** S1 to S5, S12, S13 and S17 are verified in a
browser. S14 is active; S6 to S11, S15 and S16 are open.
The browser socket is Epsilon's own protocol 6
([ADR-0009](adr/0009-socket-speaks-epsilon.md)); the engine runs in this process
([ADR-0008](adr/0008-embed-pi-engine-with-opinions.md)). The deployment boundary is
decided ([ADR-0005](adr/0005-deployment-owns-agent-home.md)) and not built. Modules
named below exist; later slices add the rest.

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
                    │  routes: sessions, readiness and settings                │
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
ADR-0008. Idle engines do not leak: ten seconds after the last tab detaches, an
engine that is not running, compacting or waiting on a dialog disposes itself, and
the next attach rebuilds it from pi's session file. A run or a pending dialog keeps
it alive, so a reload or a quick reopen reattaches to the same run.

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

| Module                       | Owns                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                   | The Hono app and its generated OpenAPI document, exported for tests. No listener.                                            |
| `serve.ts`                   | `Bun.serve` with `fetch` + `websocket`, and the shutdown hooks                                                               |
| `config.ts`                  | Ports, paths, caps, env. The only place that reads `process.env`                                                             |
| `runtime.ts`                 | The one engine registry, shared by the socket and the REST handlers                                                          |
| `agent/engine.ts`            | `createAgentSession`, the CLI built-ins and Epsilon's defaults, and the JSON event transform                                 |
| `agent/ui-context.ts`        | pi's `ExtensionUIContext`, mapped onto dialogs and notices; TUI-only methods say so once                                     |
| `agent/ui-bridge.ts`         | The `UiHost` the engine gets, holding back the TUI methods used before the first tab attaches                                |
| `agent/frames.ts`            | The tabs watching one session: add, remove, fan out                                                                          |
| `agent/defaults/`            | The guard and the ask-question tool Epsilon ships, as inline factories (ADR-0008, ADR-0010)                                  |
| `agent/models.ts`            | The model list the picker offers and `set_model` resolves against                                                            |
| `agent/sdk.ts`               | The one re-export of the SDK classes the settings modules call (rule 1)                                                      |
| `agent/readiness.ts`         | Whether a home holds a usable model, asked of pi's own runtime                                                               |
| `agent/session.ts`           | One live session: commands, snapshot, engine events, idle lifetime, dispose                                                  |
| `agent/dialogs.ts`           | Pending dialogs, method-matched answers, keyed display state, unsupported TUI methods                                        |
| `agent/registry.ts`          | sessionId → engine, creation dedupe, dispose when the last tab leaves                                                        |
| `agent/sessions.ts`          | pi's session-manager: the only path from REST to session files                                                               |
| `settings/read.ts`           | One settings snapshot, including a file the panel had to skip                                                                |
| `settings/models-file.ts`    | The `models.json` shape, the field merge that keeps unknown keys, and the path helpers                                       |
| `settings/providers.ts`      | Provider views and detail, built-in ids, and the runtime the panel reads them through                                        |
| `settings/provider-write.ts` | Upsert and remove, the partial-field policy, the reasoning map and compat, and the credential logged out with a stored one   |
| `settings/import-models.ts`  | Bounded model-list reads, the per-model shape a `supported_endpoints` list implies, and pi's catalog metadata for a match    |
| `settings/test-probe.ts`     | The throwaway runtime, the keyless and keyed probes, and the streamed reasoning usage                                        |
| `settings/test-provider.ts`  | Composes one draft's test target and the sentence the provider form shows                                                    |
| `settings/mcp.ts`            | MCP servers in `mcp.json`: list, read, write, remove, and the transport switch that clears the other target                  |
| `settings/skills.ts`         | User skills as `<agent home>/skills/<name>/SKILL.md`                                                                         |
| `settings/defaults.ts`       | The default model, through `SettingsManager`                                                                                 |
| `settings/packages.ts`       | Packages, through `DefaultPackageManager`                                                                                    |
| `settings/store.ts`          | Documented paths, JSON read/write, one queue per path, 0600, and the unreadable file the panel must name                     |
| `sessions/list.ts`           | Joining stored sessions with live engines, newest first                                                                      |
| `sessions/delete.ts`         | Removing one session file, refused while an engine holds it                                                                  |
| `ws/chat.ts`                 | Socket upgrade state, hello, attach/detach, commands, dialog answers, one checked send                                       |
| `routes/*.ts`                | Thin handlers: validate, call one function, return. `write.ts` is the one settings write; `failure.ts` the one refusal shape |

Not built yet, and named only so the slices stay findable: the Host check, file and
diff routes, the preview listener, the terminal pty, the resources page,
notifications, and the queue/backpressure channel.

`shared/src/`: browser-safe. No `node:*`, no React.

| Module                      | Owns                                                                        |
| --------------------------- | --------------------------------------------------------------------------- |
| `protocol/version.ts`       | `PROTOCOL_VERSION`                                                          |
| `protocol/frames.ts`        | zod schemas for every socket frame, the command union and the snapshot      |
| `provider-endpoints.ts`     | API families, inserted paths, request and model-list URLs, base URL warning |
| `permission.ts`             | The permission mode values and the keyed-status text both sides read        |
| `model-key.ts`              | One model key for the composer menu and the settings picker                 |
| `schemas/problem.ts`        | The one refusal body every route documents and every read parses            |
| `extui.ts`                  | zod schemas for dialog questions, answers and display requests              |
| `pi.ts`                     | Type-only re-export of pi's `JsonAgentSessionEvent`, the reducer's input    |
| `conversation/state.ts`     | `ConversationState`                                                         |
| `conversation/reduce.ts`    | `reduce(state, frame)`: pure, replay-tested; the frame vocabulary           |
| `conversation/events.ts`    | pi's event half of the reducer: streaming, tool runs, notices               |
| `conversation/content.ts`   | The content-part parse the reducer and the transcript share                 |
| `conversation/selectors.ts` | Derived views: messages, running tools, pending dialog, needs-input         |
| `conversation/tools.ts`     | zod schemas for tool arguments the renderers read                           |
| `conversation/fixtures/`    | Recorded event logs, one per hard case                                      |
| `schemas/sessions.ts`       | zod schemas for the REST session bodies                                     |
| `schemas/readiness.ts`      | zod schema for the readiness answer                                         |
| `schemas/providers.ts`      | Provider, model, reasoning map, compatibility, import and test schemas      |
| `schemas/settings.ts`       | zod schemas for the settings snapshot and the remaining writes              |

`client/src/`: React and Vite.

| Module                                   | Owns                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `link.ts`                                | One socket, backoff, hello/welcome, attach/detach, unreadable-frame report                |
| `conversation/store.ts`                  | `useSyncExternalStore` over the shared conversation state, command senders, dispose       |
| `hooks/use-conversation.ts`              | One store per session per tab, released when the route leaves                             |
| `components/route-error.tsx`             | What a render error shows: one sentence and a way back                                    |
| `routes/*.tsx`                           | The home page and `/sessions/$sessionId`; the root gates on readiness                     |
| `hooks/use-readiness.ts`                 | REST readiness, re-read on an interval so the notice clears itself                        |
| `hooks/use-settings.ts`                  | The settings snapshot query shared by every section                                       |
| `components/settings/`                   | Sections list, shell, one page per section, shared delete dialog and field errors         |
| `components/settings/providers/`         | The two-pane provider editor: panel, connection, headers, models, import, reasoning, test |
| `components/settings/offline-notice.tsx` | The one sentence a failed settings query leaves on the providers route                    |
| `components/not-ready.tsx`               | The unsupported state: one `Alert`, no composer                                           |
| `components/chat/`                       | Transcript, markdown, tool trace, confirm and question dialogs                            |
| `components/composer/`                   | Input, palette, model, thinking-level and permission menus, `!cmd` and `/reload`          |
| `components/sessions/`                   | The sidebar list                                                                          |
| `components/ui/`                         | shadcn primitives                                                                         |
| `lib/`                                   | Markdown, Shiki, formatting, permission modes                                             |

## Data flows

**Open a session.** The id comes from the sidebar list or a new UUID → WS `attach`
→ the registry builds an engine, or reuses the live one → a snapshot from the
engine's own state, messages, models and commands → client replaces state → later
frames are deltas.

**Send a command.** `command { type: "prompt" }` → `LiveSession.run` →
`AgentSession.prompt` → pi emits session events → `toJsonEvent` → `event` frames →
the reducer. `steer`, `abort`, `bash`, `set_model`, `set_thinking_level` and `reload` map to one
`AgentSession` method each. `bash`, `set_model`, `set_thinking_level`, `reload` and
a session rename refresh the snapshot because they change what the snapshot
reports. The thinking level is clamped by pi, and the effective level comes back in
the snapshot and in `thinking_level_changed`.

**Answer an extension dialog.** The engine's `ExtensionUIContext.ask` blocks a tool
call → `agent/dialogs.ts` stores it and sends `dialog` → the client renders →
`dialog` answer back → the pending promise resolves. `abort` answers every pending
dialog as cancelled, and a dialog's own timeout does the same.

**Close and return.** The session page releases its store when it unmounts, and the
store detaches. The last `detach` starts a ten second idle timer (the store's
release waits one tick so StrictMode's double mount reuses it). A new `attach`
cancels the timer, so a reload, a route change or a phone locking the screen
reattaches to the same engine and replays its dialogs. When the timer fires, the
engine disposes and the next `attach` rebuilds it from pi's session file.

**Configure.** `GET /api/settings` reads the home and pi's runtime, and each write
route parses its body, writes one file or calls one SDK writer, then reloads every
live engine. The browser parses every answer with the shared zod schemas, so a
shape it cannot read is an error it shows, never a blank tab. See
[ADR-0012](adr/0012-configure-in-the-dashboard.md).

**Test a provider.** `POST /api/settings/providers/test` builds a throwaway runtime,
registers the draft, and calls `completeSimple()` once without auth headers and once
with the typed or stored credential. A `level` is passed as `reasoning`. The result
names the field the request carried and the streamed reasoning tokens or thinking
characters, and no file is written. Model import is the other non-pi call: a
bounded `GET /models` whose `supported_endpoints` can give a model its own API and
base URL, and whose exact id and API can inherit pi's reasoning metadata.

**Not ready.** `GET /api/readiness` asks a model runtime built from the same home and
the same two files the engine reads, so the answer cannot drift from what a session
would see. It is REST, not a socket frame, and it caches nothing. The root route
replaces every page with one `Alert` naming the home and opening Settings, and
renders no composer, so no engine is built while the deployment is unconfigured.

## State ownership

The deployment boundary owns the first two rows. Nothing outside it is read or
written unless the operator mounts it there
([ADR-0005](adr/0005-deployment-owns-agent-home.md)).

| State                                               | Owner                              | Lifetime                                               |
| --------------------------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| Transcript, branches, compaction, session name      | pi's JSONL in the agent home       | Forever                                                |
| Thinking level, per session                         | pi's JSONL and the live engine     | Forever in the transcript; startup comes from settings |
| Settings, credentials, models, MCP, packages, trust | the agent home (`$HOME/.pi/agent`) | Forever                                                |
| Live engines                                        | `agent/registry.ts`                | 10s after the last detach, unless busy                 |
| Unanswered extension dialogs, display state         | `agent/dialogs.ts`                 | Until answered, cancelled or timed out                 |
| Pins, archive, project order                        | not built                          | —                                                      |
| View state, scroll position, drafts                 | Browser                            | Tab lifetime                                           |

Nothing else is persisted. The agent home is not recorded anywhere: it is
deterministic, so a file naming it would be a second source of truth.

## Failure modes

| Failure                                 | Behaviour                                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Engine creation fails                   | The socket answers `AGENT_START_FAILED`; the page shows it, never a blank session                                          |
| An extension handler throws             | The engine reports it through `onError`; the page shows `EXTENSION_ERROR`                                                  |
| An engine bug crashes the host          | Every live session dies with the server. Accepted in ADR-0008; the session files survive                                   |
| Socket drops                            | Reconnect with backoff, `attach` again, a snapshot replaces state                                                          |
| A tab closes mid-run                    | The engine keeps running with no tab; a reopen reattaches and sees the turn in progress                                    |
| Server restarts                         | Same as a socket drop; in-flight turns are lost                                                                            |
| Protocol version mismatch               | `PROTOCOL_MISMATCH` → the session page shows a reload notice and stops attaching                                           |
| Agent home unconfigured                 | The not-ready notice names the home and opens Settings; a turn cannot be sent                                              |
| Credential present but rejected         | The turn fails with pi's own error (a 401, for example), which the transcript shows; readiness cannot tell in advance      |
| `models.json` or `mcp.json` unparseable | The settings snapshot carries a sentence naming the file; neither list pretends it is empty, and every write refuses       |
| A dialog answer names another method    | The server answers `UNSUPPORTED_FRAME`; a stale answer for an already-settled dialog is ignored, because two tabs may race |
| The settings query fails                | The providers route is one centred sentence, with no list, no editor, no retry label and no back button                    |
| The browser cannot read a frame         | The store shows one notice per connection instead of dropping it in silence                                                |
| Project not trusted                     | pi skips project resources; the dashboard does not report it yet ([note](notes/2026-10-28-host-cannot-answer-trust.md))    |
| pi upgrade changes its surface          | Types break at compile time first; re-verify against [reference/pi-sdk.md](reference/pi-sdk.md)                            |
| Extension uses TUI-only UI              | One warning names the methods that need the terminal tab; never silence                                                    |

## Size budgets

| Area                       | Target                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `server/src/agent/`        | under 900 lines total; the SDK wiring and the UI bridge live here                              |
| `shared/src/conversation/` | under 500 lines                                                                                |
| `server/src/routes/`       | one handler under 60 lines; one resource per file                                              |
| Any single file            | under 300 lines                                                                                |
| Client components          | one concept per file; if it needs more than ~10 state values, the state belongs in the reducer |

Every file is under the 300-line cap. The two area totals are still over target:
`server/src/agent/` is about 1380 lines and `shared/src/conversation/` about 710.
Both are large because the engine wiring and the transcript are one concept each;
the seams that keep them readable are `session.ts` (commands, lifetime, events),
`frames.ts` (fan-out), `ui-context.ts` (the pi surface), and on the shared side
`reduce.ts` (frames), `events.ts` (pi's events) and `selectors.ts` (what renders).
