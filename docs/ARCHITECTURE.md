# Architecture

A one-page map of the target. Code is the reality; this page says where things go and
why. Decisions and their rejected alternatives: [DECISIONS.md](DECISIONS.md). What pi
exposes: [pi-sdk.md](pi-sdk.md). How server code is written: [effect.md](effect.md).

## Runtime shape

```
Browser tab ──one WebSocket (Effect RPC)──▶ epsilon   (Bun, one port, one process)
                                             ├─ serves dist/app
                                             ├─ catalog (in process) ── <home>/.epsilon/session-index.sqlite
                                             └─ supervisor ──Bun IPC──▶ engine, one per live chat
                                                                         (pi's AgentSessionRuntime + extensions)
```

| Process   | Owns                                                                                  | Never does                              |
| --------- | ------------------------------------------------------------------------------------- | --------------------------------------- |
| `epsilon` | Socket, configuration, catalog reads, supervisor, the page                            | Import pi's runtime; run extension code |
| Catalog   | Runs inside `epsilon`: the index's one write connection, the fs watch, the stat sweep | Write session files                     |
| Engine    | One `AgentSessionRuntime`, its extensions, dialogs, frames                            | Talk to the browser; outlive `epsilon`  |

One crash, freeze or leak costs one chat. The chat restarts from its JSONL, which stays
the truth. The index is derived: delete it and nothing is lost.

In dev, Vite serves the UI with HMR and proxies the one socket to the server; the
server's own port redirects to Vite, so it is never mistaken for the page. In production
`bun run start` is one process serving the built page and the socket.

## Roots

- `src/protocol/`: the one contract. Effect Schema for every wire shape, the RPC group,
  an explicit `PROTOCOL_VERSION` checked against the frame list, errors both sides see.
  Types only from pi.
- `src/domain/`: pure rules both sides run: the conversation reducer, its state and
  selectors, and the MCP, provider and skill rules. No I/O, no services, no React.
- `src/backend/`: sockets, the session index, the settings features, the supervisor of
  live chats, and `platform/` where the only pi, filesystem, process and clock boundaries
  live.
- `src/engine/`: the child process. It embeds pi, bridges extension UI, and speaks one
  tagged message set over Bun IPC.
- `src/app/`: React, Vite, Tailwind, shadcn. `core/` holds the runtime, router, queries,
  errors and status line; `features/` mirrors the server's names.

Boundaries are enforced twice: tsconfig project references for what may type-check
together, and `no-restricted-imports` per root. A feature reaches another feature only
through its service or index (`epsilon/no-feature-internals`): on the page the features
root is `src/app/features`, on the server it is `src/backend`, whose composition root is
the files beside the feature folders, not a feature.

## Inside a server feature

The schema is not here: it is `src/protocol/<name>.ts`, shared with the page. The
feature folder holds `service.ts` (`Effect.fn` operations, typed errors), `handlers.ts`
(the RPC handlers, which only compose the service), `store.ts` when it reads or writes
files through pi's exporters or `JsonDocument`, and its tests. Pure logic worth testing
alone is `rules.ts`. IO goes through `platform/`.

The shape is the same for every configuration feature, so a reader learns one and knows
the rest. The client mirrors it: `features/<name>/` with a query hook, a form and a
view, built from the shared patterns.

## Request flow (configuration)

1. A component calls a typed function from `src/app/core/runtime.ts`.
2. `RpcClient` encodes the payload with the protocol schema and sends it on the one
   socket.
3. The server handler decodes it again (the wire is not trusted), runs the service, and
   returns the schema'd value or one of the declared tagged errors.
4. The client renders the value, or maps the error to a view through `errorView`, which has
   words for every tagged error the protocol declares: a new tag does not type-check until
   it does. The surfaces and their rules are [below](#feedback-surfaces).
5. A write invalidates through a pushed stream (`settings.changes`, `sessions.changes`),
   never a timer; a provider sign-in streams its progress on `settings.providers.login`, and
   a reloaded page reads `loginState` and attaches to the running flow rather than starting
   a second one.
   React Query is the cache, not the source of truth.

## Live chat flow

1. The page attaches to a session: `conversation.attach` returns a stream of frames.
2. The registry either reuses the engine for that session or asks the supervisor to
   spawn one inside a scope. The engine builds its runtime from the session file.
3. The engine sends a windowed snapshot (entry ids, recent entries, notices); older
   pages arrive when the transcript asks. The flat tree arrives when the picker opens,
   and the reducer nests it so the picker draws main's shape. The composer's readings
   (pi's context usage, the session's totals, the cache warmer) follow the snapshot and
   again whenever pi's numbers change, and the keyed statuses extensions set travel as a
   `statuses` frame.
4. Commands go down the same socket as tagged values; extension dialogs come back as
   frames and their answers go back as commands. A prompt whose text starts with a name in
   the built-in table is answered by the engine before pi, so a `/compact` never reaches
   the model; the browser answers its own surfaces before sending.
5. The reducer in `src/domain/` turns frames into state; the view renders state. A
   state-only resync replaces the transcript without replaying frames.
6. A crash sends `EngineStopped` to that chat's tabs only; the next command respawns.

## Where state lives

| State                                           | Truth                                                 |
| ----------------------------------------------- | ----------------------------------------------------- |
| Sessions, transcript, tree                      | pi's JSONL on disk                                    |
| Session list, pins, renames                     | The SQLite index (derived) and `pinned-sessions.json` |
| Providers, models, MCP, skills, packages, trust | pi's documented files                                 |
| Epsilon settings (`maxRunning`, …)              | `<home>/.epsilon/settings.json`                       |
| Open chats, engine processes, fibers            | Scopes in the server process                          |
| Transcript, draft, scroll anchor                | The browser tab                                       |

Nothing important lives only in server memory or only in the browser. A state the code
cannot represent is a visible notice, never silence.

## UI rules that are not obvious from the code

- Three client layers. `src/app/styles/` holds the tokens (`tokens.css`: layout sizes, gaps
  by role, type roles, dialog sizes, motion) and the motion that is not a token entrance
  (`motion.css`). `src/app/components/ui` is shadcn registry source.
  `src/app/components/patterns` is what features compose. `components/editor` is the file
  tree, markdown and highlighting.
- Every column starts with a `PaneBar` (`h-bar`, the one rule columns share), so the
  sidebar, a list and a chat share one line. One inset per column: bar title, search, a
  group heading and a row's text start on the column's gutter.
- A selection reveals with one `enter-rise`: a chat's rows and composer rise with the same
  token. A pane bar's title and count drop in from above, and again when their text
  changes.
- A dialog is `DialogFrame size="sm|md|lg"`, with a fixed body height unless
  `body="content"`; its content stays mounted while closed, so the transitions play.
- Compose the installed shadcn components. Chat primitives (`Message`, `Trace`,
  `CodeBlock`, `Marker`) mean something, so do not fake them with divs. Composition is
  Base UI (`render={<Button />}`), never `asChild`.
- Radius follows one ladder: `rounded-md` for rows and chips, `rounded-lg` for controls,
  menus and code, `rounded-xl` for dialogs, panels and bordered lists, `rounded-2xl` for
  message bubbles only, and `rounded-full` only for pills and circular icon buttons.
- Colour carries state only (running, needs input, error, selected). Surfaces rest white;
  a muted fill is a state.
- Destructive actions use `variant="destructive"` and confirm in an `AlertDialog`.
- Registry classes beat base-layer CSS: shadcn's `cursor-default` is a utility and wins
  over any base rule, so it is removed from the component files. When a registry class
  string is rewritten, diff it against `shadcn view` instead of retyping it (a dropped
  `[&>svg]:size-3.5` once blew the checkbox tick up to 24px).
- A Base UI dialog mounted already open has no motion. Mount closed and open on the next
  animation frame; close, wait for the transition, then unmount.
- Registry defaults are source; a local change in `components/ui` is explained where it
  is made.

### Feedback surfaces

Choose by the scope of what the message is about. A feature never invents its own.

| Scope                             | Surface                                                                                                                                                                        | Examples                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| The whole app                     | the status line: `AppStatus` in `src/app/core/status.tsx`, fed by `useReportStatus`                                                                                            | server unreachable, page out of date, no model ready, a chat that cannot continue |
| A route crashed or does not exist | `RouteError`, `RouteNotFound` on `StatusView`, inside the shell: `errorComponent` and `notFoundComponent` on the `_app` and `settings` layouts; the router's defaults are last | a render throws, an address nothing serves                                        |
| A pane's own read                 | `StatusView`: loading, empty, failed, not found                                                                                                                                | the provider list failed to read, no skills yet                                   |
| A section, form or card           | `Notice` at the top of what it is about                                                                                                                                        | save refused, pi could not parse `settings.json`, a project overrides this server |
| Beside one control                | `InlineStatus`                                                                                                                                                                 | Saved, Checking…, connection test failed                                          |
| One field                         | shadcn `FieldError` under the field                                                                                                                                            | "Use a whole number."                                                             |
| A chat turn                       | the transcript's error entry and `RunStatus`                                                                                                                                   | the model refused, retrying in 4 s, compaction failed                             |
| Before a destructive action       | `confirm-dialogs` (`AlertDialog`), `variant="destructive"`                                                                                                                     | delete a chat, remove a provider                                                  |

- **One tone vocabulary**: `Tone = "neutral" | "info" | "success" | "warning" | "danger"`
  in `src/app/components/patterns/status/status-tone.ts`, taken by `StatusView`, `Notice`,
  `InlineStatus` and the status line.
- **One translator**: `errorView(error)` in `src/app/components/patterns/status/error-view.ts`
  returns `{ tone, title, line, icon }` and switches exhaustively on the protocol's tagged
  errors, whose union is derived from `src/protocol/errors.ts`, so a new tag does not
  type-check until it has words. `StatusView` and `Notice` take `error={…}`, and an
  explicit title may name the action more precisely. Features never render
  `error.message`. A failure the page names itself is a tagged error in
  `src/app/core/errors.ts`, so it has words too.
- **No toasts.** A message that disappears is a failure nobody saw (invariant 10).
  Success is the changed UI; where the change is not visible, the form shows
  `InlineStatus` "Saved".
- **Spinners**: a waiting pane or section shows `LoadingState`. A bare `Spinner` lives
  only inside a pending `Button`.
- **Words**: the title says what did not happen ("Couldn't save the provider", "Couldn't
  read MCP servers"), not "Error" or "Failed:". Something missing is "Session not found".
  The line gives the reason in pi's words when there is one, then what to do. No stack
  traces, error tags or JSON in the UI; they go to the log and Diagnostics.
- **Colour only through the surfaces.** Files under `src/app/features/` and
  `src/app/routes/` do not import `@/components/ui/alert` and do not write
  `text-destructive`, `text-warning`, `text-success`, `text-info` or their `bg-`/`border-`
  forms; `epsilon/feedback-surfaces` enforces it.

## File rules

- A file is one concept read top to bottom. Private helpers and subcomponents stay in it.
- A file earns its own place when it is a public surface, an I/O boundary, pure logic
  tested on its own, something with its own state, or code used by two modules.
- No file that only re-exports or wraps one call. No `index.ts` barrels except where a
  folder is a public surface for another root.
- No folder for one file. A subfolder needs about four siblings with a shared role.
- Extract on the third use. Lift to `src/domain/`, `platform/`, `components/patterns/`,
  `hooks/` or `lib/` when a second feature needs it; never reach into a sibling.
- Tests sit next to the file they test. Shared helpers and fixtures live only in `test/`.
- Past roughly 400–500 lines, ask whether it is still one concept. There is no hard
  limit.
- What changes together lives together.
