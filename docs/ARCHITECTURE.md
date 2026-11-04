# Architecture

A one-page map of the target. Code is the reality; this page says where things go and
why. Decisions and their rejected alternatives: [DECISIONS.md](DECISIONS.md). What pi
exposes: [pi-sdk.md](pi-sdk.md). How server code is written: [effect.md](effect.md).

## Runtime shape

```
Browser tab ──one WebSocket (Effect RPC)──▶ epsilon   (Bun, one port, one process)
                                             ├─ serves dist/app
                                             ├─ catalog worker ── <home>/.epsilon/session-index.sqlite
                                             └─ supervisor ──Bun IPC──▶ engine, one per live chat
                                                                         (pi's AgentSessionRuntime + extensions)
```

| Process        | Owns                                                                 | Never does                              |
| -------------- | -------------------------------------------------------------------- | --------------------------------------- |
| `epsilon`      | Socket, configuration, catalog reads, supervisor, the page           | Import pi's runtime; run extension code |
| Catalog worker | The only write connection to the index, the fs watch, the stat sweep | Write session files                     |
| Engine         | One `AgentSessionRuntime`, its extensions, dialogs, frames           | Talk to the browser; outlive `epsilon`  |

One crash, freeze or leak costs one chat. The chat restarts from its JSONL, which stays
the truth. The index is derived: delete it and nothing is lost.

In dev, Vite serves the UI with HMR and proxies the one socket to the server; the
server's own port redirects to Vite, so it is never mistaken for the page. In production
`bun run start` is one process serving the built page and the socket.

## Roots

- `src/protocol/`: the one contract. Effect Schema for every wire shape, the RPC group,
  an explicit `PROTOCOL_VERSION` checked against the frame list, errors both sides see.
  Types only from pi.
- `src/domain/`: pure rules both sides run (the conversation reducer and selectors,
  permission rules, path rules, formatting). No I/O, no services, no React.
- `src/backend/`: sockets, the catalog, configuration features, the supervisor, and
  `platform/` where the only pi, filesystem, process and clock boundaries live.
- `src/engine/`: the child process. It embeds pi, bridges extension UI, and speaks one
  tagged message set over Bun IPC.
- `src/app/`: React, Vite, Tailwind, shadcn. Features mirror the server's names.

Boundaries are enforced twice: tsconfig project references for what may type-check
together, and `no-restricted-imports` per root. A feature reaches another feature only
through its service or index (`epsilon/no-feature-internals`).

## Inside a server feature

`contract.ts` (Effect Schema), `store.ts` (files and pi's exporters), `service.ts`
(`Effect.fn` operations, typed errors), `routes.ts` (RPC handlers), and `domain.ts` when
the feature has pure logic worth testing alone. IO goes through `platform/`; a handler
only composes a service.

The shape is the same for every configuration feature, so a reader learns one and knows
the rest. The client mirrors it: `features/<name>/` with a query hook, a form and a
view, built from the shared patterns.

## Request flow (configuration)

1. A component calls a typed function from `src/app/runtime.ts`.
2. `RpcClient` encodes the payload with the protocol schema and sends it on the one
   socket.
3. The server handler decodes it again (the wire is not trusted), runs the service, and
   returns the schema'd value or one of the declared tagged errors.
4. The client renders the value, or maps the error to a notice through one exhaustive
   `errorView`.
5. A write invalidates through a pushed stream (`config.changes`, `providers.loginProgress`,
   `catalog.changes`), never a timer. React Query is the cache, not the source of truth.

## Live chat flow

1. The page attaches to a session: `conversation.attach` returns a stream of frames.
2. The registry either reuses the engine for that session or asks the supervisor to
   spawn one inside a scope. The engine builds its runtime from the session file.
3. The engine sends a windowed snapshot (entry ids, recent entries, notices); older
   pages arrive when the transcript asks, and the flat tree when the picker opens.
4. Commands go down the same socket as tagged values; extension dialogs come back as
   frames and their answers go back as commands.
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
- Connection and version problems belong to the status line at the root and nowhere else.
  A pane shows its own loading, empty and error states with `StatusView`.
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
- Registry defaults are source; a local change in `components/ui` is explained where it
  is made.

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
