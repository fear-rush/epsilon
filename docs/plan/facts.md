# Verified facts

Status: **current.** Every line was checked against the pinned pi package, the code,
or a running server, not read from a document. When one becomes false, delete it.
Environment counts (models, commands, providers) belong in a session log, not here:
they change with the operator's home.

## Socket and reducer

- `bun run test` in `shared/` replays every fixture through `serverFrameSchema` and
  `reduce()`: the same file twice must produce the same state and at least one
  transcript row. `bun run scripts/replay.ts` prints the rows of one fixture.
- A snapshot is checked field by field for `state`, `models` and `commands`, and
  each message is checked for a known `role`. An event payload keeps pi's type and
  is checked as an envelope (an object with a string `type`). A frame that fails is
  reported once per connection, not dropped in silence.
- Rows exist for every message role: `bashExecution` becomes a bash card, a branch
  or compaction summary becomes a muted block, `custom` names its type. Nothing is
  skipped silently.
- Tool output arrives twice: from `tool_execution_end` live, and from the
  `toolResult` message in a snapshot. Both paths write the same `ToolRun`.
- A tab keeps one subscription per session, and `detach` drops only that session.
  Verified with two sessions on one tab while a second tab drove the detached one.
- The five display-only extension methods travel as `ui` frames. `setStatus` and
  `setWidget` are keyed and replayed to a late attach; `notify`, `setTitle` and
  `set_editor_text` happen once.
- The tab has one `Link` for every session it watches: stores subscribe, frames are
  routed by `sessionId`, and a socket a retry replaced cannot report `closed` on the
  working one.
- A connection-level `error` frame has no `sessionId`. A `PROTOCOL_MISMATCH` puts
  the page in a blocked state with a reload notice; any other one becomes a notice
  from `link.ts`. Error frames with a session exist as transcript notices.
- One store per session lives outside React. The route releases it one tick after
  unmount, so StrictMode's mount/unmount/mount reuses it, and the server's ten
  second grace keeps the engine.
- The client detaches when the session route leaves. Ten seconds after the last
  `detach`, an engine that is not running, compacting or waiting on a dialog
  disposes; the next `attach` rebuilds it from the session file
  ([note](../notes/2026-10-28-dispose-on-detach-kills-the-run.md)).
- `busy` means a turn is running. It comes from `agent_start`/`agent_end` and the
  snapshot's `isStreaming`. Whether a dialog blocks the engine reaches the sidebar
  through the REST session list's `needsInput`, not the socket.
- Protocol 6 carries `thinkingLevel` and `availableThinkingLevels` in the snapshot
  and `set_thinking_level` as a command. `setThinkingLevel()` clamps to the model's
  supported levels; the snapshot and `thinking_level_changed` report the effective
  one.
- An answer names the method of its question. A mismatched answer is refused with
  `UNSUPPORTED_FRAME`, a second answer for a settled dialog is stale and ignored,
  and the first answer wins.
- `command-result` carries `ok`, the command name and an error. The engine's other
  reply data never reaches the browser; the snapshot carries the model instead.
- pi's `steer` lands at the next turn boundary, not mid-token. The composer says
  "steer" for that reason.
- A shell run is a recorded message, not an agent event: `bash` streams
  `bash_execution_update` and records a `bashExecution` message, so the socket
  re-reads the snapshot after the reply and again at `agent_settled`
  ([note](../notes/2026-10-28-bash-result-is-not-an-event.md)).
- After a successful `set_model`, the server re-reads the snapshot for every
  subscriber. The engine looks the pair up in the available models and the command
  fails with `Model not found: provider/id` otherwise.
- `toolsFromMessages` makes two passes because the arguments are on the assistant's
  `toolCall` and the result arrives later. A run built from a snapshot still has
  its command, its path and its diff.
- The engine's `session.messages` includes system messages; the snapshot filters
  them at the edge, so the system prompt never reaches the browser.
- `JsonAgentSessionEvent` is public, but the transform that produces it is not
  exported, so `engine.ts` carries it
  ([note](../notes/2026-10-28-tojson-is-not-exported.md)).
- `SessionManager.create(cwd, undefined, { id })` on an unknown id keeps the id in
  memory, not a file: the JSONL appears on the first message
  ([note](../notes/2026-10-28-fresh-session-id-writes-no-file.md)).
- `session.dispose()` leaves process handles behind, so a one-shot script needs
  `process.exit` ([note](../notes/2026-10-28-engine-keeps-the-process-alive.md)).
- An extension handler that throws is reported once as `EXTENSION_ERROR`; other
  agent failures are `AGENT_FAILED`. With no tab attached the session holds the
  last few errors and delivers them on the next attach, so a failure during engine
  construction is not lost.
- A host cannot answer pi's trust prompt. With no stored decision the project's
  protected resources are skipped
  ([note](../notes/2026-10-28-host-cannot-answer-trust.md)).
- The not-ready notice replaces the routed page in `client/src/routes/__root.tsx`,
  and a session route does not mount until the readiness answer arrives, so no
  session attaches and no engine is built while the home is unconfigured or unknown.
- A render error shows the route error component: one sentence and **Try again**,
  not the router's default screen.

## Agent home and process

- The agent home is `config.agentHome`: `EPSILON_AGENT_HOME`, else pi's own
  `~/.pi/agent`. `config.ts` publishes it as `PI_CODING_AGENT_DIR` and hands it to
  every engine explicitly, so an inherited value loses. Verified with the override
  pointed at a temp home and an inherited variable pointed at the operator's: the
  session file landed in the temp home, and the palette dropped to pi's built-in
  extensions only.
- `config.ts` overrides `PI_CODING_AGENT_DIR` and nothing else, so `PI_PACKAGE_DIR`
  and `PI_CODING_AGENT_SESSION_DIR` are still inherited. `scripts/dev.ts` clears
  both for a sandbox run; a deployment relies on its own environment. The first
  variable still moves bundled asset paths, which ADR-0005 decision 3 asks for and
  the code does not do.
- `~/.agents/skills` and a project's `.pi/` are read by pi independently of the
  home variable, so a source run on a host still sees that host's skills. The
  container in S11 fixes it from the outside.
- The agent's project is `config.projectDir`: `EPSILON_PROJECT` or the repo root,
  never `process.cwd()`, because `turbo dev` starts the server task inside
  `server/` and pi reads that as the project
  ([note](../notes/2026-10-28-turbo-runs-the-agent-in-server.md)).
- The session list and delete read pi's home in the server process. The list is
  `SessionManager.list(config.projectDir)` joined with `registry.live()`; the
  project's own id lookup is `SessionManager.findById`.
- `bun run dev` runs `scripts/dev.ts`, which sets the home and project and then
  runs `turbo dev`. Turbo's `envMode` defaults to `"strict"`, so a variable reaches
  the server only if `turbo.json` declares it; the home, project and pi variables
  are declared on the `dev` task
  ([note](../notes/2026-10-28-turbo-drops-undeclared-env.md)).
- `bun run dev` copies the operator's `auth.json` and `models.json` into
  `.sandbox/agent`, and sets `HOME` aside only for those copies: `HOME` itself does
  not change. Both are copies because Settings writes them. `bun run dev:host` uses
  the real home.
- The sandbox proves the home needs no bootstrap: pi writes `sessions/`,
  `models-store.json` and an empty `auth.json` itself on first use.
- Readiness is REST, built from the same `auth.json` and `models.json` paths the
  engine uses, and it caches nothing. It answers from pi's cached model list, so it
  cannot tell a live key from a rejected one: only a turn can.
- The not-ready strings are plain text in an `Alert`; a markdown backtick renders
  literally, so the copy carries none.

## Settings writes

- `models.json` and `mcp.json` are hand-edited files. A read the panel cannot
  parse becomes a sentence in the settings snapshot, naming the file; a write
  refuses the same file instead of replacing it.
- Provider fields are partial: an omitted field keeps the stored value and an empty
  string clears it. A model entry is a complete record: a field it leaves undefined
  is unset. Unknown keys survive on the entry, on each model and on each override,
  because every file schema is a loose object and the merge starts from the stored
  value.
- A blank key keeps the stored credential. A blank value on a stored header keeps
  it; a new header needs a name and a value, and the form refuses an incomplete row.
  Header values, and an MCP server's environment and header values, never travel to
  the browser.
- A provider id is letters, digits, dashes and underscores, and `new` is reserved
  because it is the add-provider route. The form derives the id from the display
  name, suffixes a taken id with `-2`, and refuses a name another configured or
  pi-shipped provider already uses; the id is fixed after the first save. A provider
  or model base URL must be an absolute URL at the HTTP boundary, and an empty
  provider string clears the field.
- `api: ""` clears a provider's API family; a missing `api` keeps the stored one.
- MCP input is a union on `transport`, so a stdio server needs a command and an
  HTTP server needs a URL. Switching transport clears the other target's fields.
  A read returns environment and header names but not values. A blank value on a
  stored row keeps it and an omitted row removes it. The name is the `mcp.json` key,
  so it is fixed after the first save and a new server refuses a name already in
  the list; the two-pane editor is selected by route.
- Writes go through one queue per path, are written with mode `0600`, and keep the
  rest of the file. Two panel clicks cannot lose each other.
- The API validates every body and param with the shared zod schema. A refusal is
  the route's one `{ message }` shape, including validation failures, so the client
  never has to parse two error formats.
- Removing a provider deletes its `models.json` entry and, when
  `ModelRuntime.getProviderAuthStatus()` says the key is stored, calls
  `ModelRuntime.logout()`. A key from the environment or from `models.json` is not
  touched.
- Model import uses the typed key, or the stored credential resolved by
  `ModelRuntime.getAuth()` on the server; the key is never sent to the page. A
  `supported_endpoints` list can give a `/messages`-only model the Anthropic API and
  the base above its `/v1`, and a `/responses`-only model that API. An exact id and
  API in pi's catalog supplies `reasoning`, `thinkingLevelMap` and
  `forceAdaptiveThinking`.
- The provider test registers the draft on a throwaway runtime, probes without auth
  headers and again with the typed or stored key, and reads a clone of the stream.
  A `level` is passed as `reasoning`; the result names the sent field and the
  reasoning tokens or thinking characters. A filled key that fails is an error even
  when the keyless probe works.
- Packages go through `DefaultPackageManager.installAndPersist` and
  `removeAndPersist`; the panel never calls the CLI.
- A skill name is a route segment and a directory name. The shared schema rejects
  anything but letters, digits, dashes and underscores, and `settings/skills.ts`
  also refuses a resolved path that leaves the skills root.
- `GET /api/settings` on a home with no provider answers `ready: false`, every
  built-in unconfigured, and no models. `POST /api/settings/providers` with a valid
  entry flips readiness on the next read.

## UI

- The permission control reads the extension's keyed status through
  `parsePermissionStatus`, but renders its own three labels. Switching sends
  `/permission <mode>` as a prompt: pi dispatches an extension command before
  touching the agent, so it starts no turn and writes no message.
- Keyed statuses other than `permission` are held in reducer state and not rendered
  yet. Widgets render as text above the composer.
- Thinking renders as a muted paragraph above the answer, with no duration and no
  collapse. The composer's thinking menu offers the current model's supported
  levels and stays hidden when the model offers only Off.
- Diffs and written files render as `CodeBlockLine variant="removed"/"added"` inside
  `CodeBlockContent`; the `+` and `−` marks come from the component, not from copy.
- The model menu is a `DropdownMenu` with one `DropdownMenuRadioGroup` per provider,
  current provider first. The settings default-model picker is a `Command` in a
  `Popover`.
- The settings navigation and the deployment menu both read
  `settings-sections.ts`; the settings shell and the provider panel resolve their
  selection with `useMatchRoute`, not a hand-written pathname regex.
- Every settings list uses one `DeleteDialog`. A page owns its mutation and passes
  the pending state; the dialog owns the confirmation, the spinner and the error.
- The settings shell and the session sidebar use the exported `SIDEBAR_WIDTH`, so
  the column edge does not jump between the two surfaces. `useIsMobile` treats
  anything under 1280px as mobile.
- The provider editor's right column is a flex column: the form scrolls above a
  footer pinned to the bottom. A new provider has Test, Cancel, Save; a saved one
  has Test, Delete, Save. Cancel confirms before discarding the draft.
- A form submit inside a grid stretches to the grid width; each settings form puts
  it at the right edge instead.
- Base UI groups menu parts: a `DropdownMenuLabel` or item outside a
  `DropdownMenuGroup`/`RadioGroup` throws "MenuGroupContext is missing" during
  render.
- The registry ships `cursor-default` on menu, command and select items; the base
  CSS gives clickable roles a pointer and the local components add `cursor-pointer`
  to buttons, items and the select trigger. cmdk writes `data-disabled="false"` on
  every enabled row; the pointer rule keys on `aria-disabled="true"`. The checkbox
  keeps its indicator mounted and transitions scale and opacity, with
  `[&>svg]:size-3.5`.
- `DialogContent` and `AlertDialogContent` cap their height at `100svh-2rem`,
  scroll, and wrap long tokens, so a long permission command or option stays inside
  the dialog. Overlays use Base UI's `data-starting-style`/`data-ending-style`
  transitions; a dialog that mounts already open needs an explicit next-frame open
  and a delayed close before its route action (the discard guard does both).
- Network failures are phrased: a dropped fetch reads "The server is not
  reachable." with no retry label. The sidebar keeps its rows while the poll retries
  in the background; a failed delete reports inside its dialog. When the settings
  query fails, the providers route is one centred sentence with no list, editor or
  back button.
- UI copy has no middots. Lists join with a comma; pi's own model names keep their
  `·` and are rendered as received. Durations read `done (1.2s)`.
- The composer is an `InputGroup` with a `block-end` addon holding the model,
  thinking level, permission, stop and submit controls. Enter sends, Shift+Enter adds a line, Esc
  stops a run, and a bare `!` or `!!` that has no command stays in the draft.
- The tab settles a turn twice: `agent_end` then `agent_settled`. Both clear
  `busy`; `abort` produces `message_end`, `turn_end`, `agent_end` and
  `agent_settled`, so a stopped turn keeps its partial text.
