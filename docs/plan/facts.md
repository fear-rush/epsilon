# Verified facts

Status: **current as of S5.** Every line here was checked against the pinned pi
package or against a browser session, not read from a document. When one becomes
false, delete it rather than adding a correction below it.

- `bun run scripts/replay.ts` in `shared/` replays every fixture twice and prints
  the rows. A `.json` fixture is one frame, such as a snapshot.
- Rows exist for every message role: `bashExecution` becomes a bash card, a
  branch or compaction summary becomes a muted block, `custom` names its type.
  Nothing is skipped silently.
- Tool output arrives twice: from `tool_execution_end` live, and from the
  `toolResult` message in a snapshot. Both paths write the same `ToolRun`.
- A tab keeps one subscription per session: a second `attach` no longer returns
  early, and `detach` drops only that session. Verified with two sessions on one
  tab while a second tab drove the detached one.
- The five display-only extension methods travel as `ui` frames. Keyed status and
  widget state is replayed to a late attach. Verified: a second tab receives
  `setStatus` without prompting.
- `client/src/link.ts` ignores events from a socket it already replaced, so a
  retry's predecessor cannot report `closed` on a working connection. The tab has
  one Link for every session it watches: the store subscribes, and frames reach it
  by `sessionId`, so opening three sessions in one tab keeps one socket.
- `client/src/hooks/use-conversation.ts` keeps one store per session outside
  React, so a remount reuses the reduced transcript instead of an empty page. The
  socket no longer lives there, so the StrictMode race that cost S2 an afternoon
  cannot close a working connection
  ([note](../notes/2026-10-28-strictmode-closes-the-socket.md)).
- The agent home is `config.agentHome`: `EPSILON_AGENT_HOME`, else pi's own
  `~/.pi/agent`. `config.ts` publishes it as `PI_CODING_AGENT_DIR` and every engine
  is handed it explicitly, so an inherited value loses. Verified with the override
  set to a temp home and an inherited variable pointing at the operator's: the new
  session file landed in the temp home, the command palette dropped from 63 to 25
  entries (pi's built-in extensions only), and the model list was empty, which is
  what a home without credentials looks like.
- In that home the engine's model is pi's sentinel: `provider`, `id` and `api` are
  all `unknown`. The snapshot passes it through unchanged, so the composer trigger
  reads `unknown` and the menu opens with nothing to pick. The string is pi's, not
  Epsilon's: pi's CLI treats the same triple as "no model" (`isUnknownModel` in
  `dist/modes/interactive/interactive-mode.js`). Nothing on the page says the home
  is unconfigured, which is what the S11 notice is for.
- The permission control needs an extension that publishes a `perm:` keyed status,
  so a home without the operator's permission extension has no permission control
  at all. The trigger is Epsilon's; the status it reads is a default ADR-0008
  promises and the engine does not yet register. (The guard is registered now:
  `server/src/agent/defaults/permission.ts`, see below.)
- `config.ts` overrides `PI_CODING_AGENT_DIR` and nothing else, so `PI_PACKAGE_DIR`
  and `PI_CODING_AGENT_SESSION_DIR` are still inherited. Verified with
  `PI_PACKAGE_DIR` pointing at a Nix store path: the home was still
  `config.agentHome`, because the SDK reads the session directory from the home's
  `settings.json` and only the CLI reads the session-dir variable. The first
  variable still moves bundled asset paths, which ADR-0005 decision 3 asks for and
  the code does not do.
- The session list and delete read pi's home in the server process, so the port was
  also given a planted session file in a temp home: the list showed exactly that
  one, and `DELETE` removed it there while the operator's own file stayed. Before
  the port was published, the list would have come from one home and the turns
  would have written to another.
- `bun run dev` is `turbo dev`, and turbo's `envMode` defaults to `"strict"`: a
  variable reaches the server only if `turbo.json` declares it. The home, project
  and pi variables are declared on the `dev` task
  ([note](../notes/2026-10-28-turbo-drops-undeclared-env.md)).
- pi also reads `~/.agents/skills` and the project's `.pi/`; the home variable does
  not cover them, so a source run on a host still sees that host's skills. The
  container in S11 fixes it from the outside, through its own `$HOME`.
- The agent's project is `config.projectDir`: `EPSILON_PROJECT` or the repo root,
  never `process.cwd()`, because `turbo dev` starts the server task inside
  `server/` and pi reads that as the project
  ([note](../notes/2026-10-28-turbo-runs-the-agent-in-server.md)).
- Tool arguments live on the assistant's `toolCall`, not on the `toolResult`.
  `toolsFromMessages` makes two passes, so a run built from a snapshot still has
  its command, its path and its diff. Verified at 390px: `bash echo …` shows the
  command and the output, `edit` shows `- old` / `+ new`.
- The list is `SessionManager.list(config.projectDir)` behind
  `server/src/agent/sessions.ts`, joined with `registry.live()` by
  `server/src/sessions/list.ts`. `listAll()` is not used: it takes 1.5 s for 345
  sessions across 94 projects, and this server drives one project.
- REST lives under `/api`. `/sessions/<id>` is a client route, so a dev-server
  proxy on `/sessions` would swallow a page reload. `/api` is already proxied.
- Browse writes nothing: only the session page calls `attach`, and a new id
  writes no file until the first message
  ([note](../notes/2026-10-28-fresh-session-id-writes-no-file.md)).
- Delete resolves the id with `SessionManager.findById` and refuses while the
  registry holds a live engine. A real id from another project answers `404` and
  leaves the file alone, so the temp-project test could not touch this repo's
  sessions.
- A session with no tab disposes ten seconds after the last `detach`, and the next
  `attach` rebuilds it from the session file. A run, a compaction or a pending dialog
  keeps it alive with no tab, so a reload or a reopen reattaches to the same engine
  ([note](../notes/2026-10-28-dispose-on-detach-kills-the-run.md)).
- The session list polls `/api/sessions` every 5 s for the needs-input badge. Run
  state has no row indicator; a session running only in the terminal could not be
  detected anyway, because pi keeps no lock and appends to the JSONL without one.
- `meta.needsInput` reports whether a dialog blocks the engine; `busy` means a turn
  is running. `busy` comes from `agent_start`/`agent_end` and from the snapshot's
  `isStreaming`, so a tab that attaches mid-run shows "working" and offers stop
  instead of looking idle.
- pi's `steer` lands at the next turn boundary, not mid-token: a count that was
  steered at 38 characters still ran to 300 before "steered-ok" appeared. The
  composer says "steer" for that reason.
- `command-result` carries `ok`, the command name and an error. The engine's other
  response data (the steer disposition, the chosen model) never reaches the
  browser; the snapshot carries the model instead. A refused command becomes a
  notice naming the command.
- A snapshot carries `models` from `get_available_models`: 510 entries across the
  configured providers here. The picker is a native select grouped by provider
  with the current provider first; a searchable palette is the eventual control.
- A snapshot carries `commands` from the engine's registered commands, prompt
  templates and skills: 63 entries here, split across `extension`, `prompt` and
  `skill`. It holds only what `prompt` can expand. pi's interactive built-ins
  (`/model`, `/login`) are absent because they never reach a session, and typing
  one by hand starts an agent run with that text as the prompt. `/reload` is the
  exception: the composer intercepts it and sends the socket's `reload` command.
- A shell run is a recorded message, not an agent event: `bash` streams
  `bash_execution_update` and records a `bashExecution` message, so the socket
  re-reads the snapshot after the reply and again at `agent_settled`
  ([note](../notes/2026-10-28-bash-result-is-not-an-event.md)).
- After a successful `set_model`, the server re-reads the snapshot for every
  subscriber, so the picker shows the engine's model instead of echoing the
  request. The engine looks the pair up in the available models and the command
  fails with `Model not found: provider/id` otherwise.
- The shell is the shadcn sidebar: a 16rem column at 1280px and above, a left
  Sheet below, ⌘B to toggle. `useIsMobile` treats anything under 1280px as
  mobile, which is the tablet rule in ui.md. The right panel waits for its first
  surface (files, S6).
- `client/src/components/ui/sidebar.tsx` is trimmed from the registry to 298
  lines for the file-size cap: offcanvas only, with no rail, submenus or
  collapsed tooltips. Add them back from the registry when a screen needs them.
- `--warning` and `--success` were added to `client/src/index.css`. The needs-input
  `Badge`, diff lines and error `Alert`s use theme colours; a grep finds no raw
  palette class in `client/src` outside generated components.
- The model menu is the AI Elements model selector: a `DropdownMenu` with one
  `DropdownMenuRadioGroup` per provider, current provider first. 510 models open
  as one scrolling menu, grouped. `Command` and `Popover` came back from the
  registry for the `/` palette.
- The permission control reads the extension's keyed status (`permission`) but
  renders its own three labels, Strict, Ask and Yolo, with a shield and no glyph
  or `perm:` prefix. Switching sends `/permission <mode>` as a `prompt`: pi
  dispatches an extension command before touching the agent, even mid-run, so it
  starts no turn and writes no message into the session. Verified over the socket:
  the reply is ok, the status changes, and a second snapshot has zero messages.
- Composer controls follow AI Elements Prompt Input: model, permission, stop and
  an arrow-up submit inside the `block-end` addon. Enter submits, Shift+Enter adds
  a line, Esc stops a run. The header keeps the title and the run chip only.
- Animation comes from the shadcn utilities, not new keyframes: the streaming
  caret pulses, menus use the registry enter/exit animation, and the scroller keeps
  `scroll-fade-b`. The registry's menu animation was 100ms with a 2px slide, which
  read as no animation, so `DropdownMenuContent` now runs 200ms with a 16px slide.
- The header shows only the title. Loading, disconnected and not-ready states are
  centred: a `Spinner` until the first snapshot, a destructive `Alert` once the
  socket closes. Switching sessions therefore never flashes "No messages yet".
- Other loading states: the sidebar list shows a `Spinner` while the query runs, and
  the delete action shows one while its request is in flight.
- The composer is a white surface with a `border-foreground/25` border; the model
  and permission triggers are ghost buttons and submit is the primary round arrow,
  so the footer follows the surface instead of the old grey fill.
- Typography has two UI sizes only: `text-sm` for primary content and `text-xs` for
  secondary detail, with no arbitrary `text-[…]` values. Assistant markdown runs
  through `typeset` with `typeset-chat`, which styles headings, lists and tables
  while keeping the transcript size.
- UI copy avoids middots: durations read `done (1.2s)` and the session meta is two
  spans. Model names come from pi and keep their own `·`; the UI does not rewrite
  them.
- Base UI groups its menu parts: a `DropdownMenuLabel` or item that is not inside a
  `DropdownMenuGroup`/`RadioGroup` throws "MenuGroupContext is missing" during
  render. The session actions and the permission menu now wrap their items.
- `Button` carries `whitespace-nowrap` from its variants, so an extension option
  longer than the dialog overflowed it. Select options now set `h-auto
  whitespace-normal break-words`, and `DialogContent` and `AlertDialogContent`
  cap their height at `100svh-2rem`, scroll, and wrap long tokens.
- The permission extension prefixes its options with colour dots. The question
  dialog strips a leading pictograph, the way the permission menu shows its own
  labels instead of the extension's `perm:` glyph.
- Network failures are phrased, not raw: a dropped fetch reads "The server is not
  reachable. Retrying…". The sidebar does not show the polling error at all (the
  rows stay, the query retries); a failed delete reports inside its dialog, so the
  action is never silent.
- Every blocking prompt is now a component, not a bordered div: `confirm` is an
  `AlertDialog`, `select`/`input`/`editor` are `Dialog`s that only answer or
  cancel. Compaction, retry and extension notices are `Marker`s; `error` notices
  are destructive `Alert`s.
- The composer is an `InputGroup` with a `block-end` addon for stop and send, as
  ui.md asks.
- The tab settles a turn twice: `agent_end` then `agent_settled`. Both clear
  `busy`; `abort` produces `message_end`, `turn_end`, `agent_end` and
  `agent_settled`, so a stopped turn keeps its partial text.

## Verified in a browser for S12 and S5

- A turn streams with no `pi --mode rpc` child and one `src/serve.ts` process.
- A permission `confirm` appears in the page; a second tab on the same session sees
  it too; one answer closes it in both. Reloading while it waits replays it, and the
  run continues after the answer.
- A steer typed while a run streams lands as a user message, and abort settles the
  run with the partial answer kept.
- `!echo shell-ok` makes a bash card with its output.
- The `/` palette carries 64 commands in three columns, is 730px wide inside a
  768px composer, moves its highlight with the arrow keys, and runs a picked skill.
  At 390px neither the palette nor a long permission command overflows.
- `/reload` answers ok while idle and while a run streams; the run still settles.
- A run continues with no tab: a close and a reopen four seconds later showed the
  transcript grow from 172 to 548 characters and reach the end of the count.
- A model switch is used by the next turn and survives a reload once the session
  file exists; before the first message it is lost
  ([note](../notes/2026-10-28-model-switch-waits-for-the-first-message.md)).
- A CLI-created session opens in the page, the CLI reads a turn written in the page,
  and the page reads a later turn written by the CLI.
- A probe extension registering `/mcp` replaced the built-in and produced no
  `mcp:2`; removing it and `/reload` restored the built-in.
- The TUI-only methods used at session start arrive as one notice naming them all.
- A session with a pending dialog shows the `needs input` badge in the sidebar.
- `DELETE /api/sessions/{id}` answers `409 SESSION_RUNNING` while an engine holds it
  and `204` after the idle grace.

## Verified for the embedded engine (S12)

- No `pi --mode rpc` child exists during a turn: `pgrep -f "mode rpc"` is empty
  while a prompt streams. Engine creation measured 669 ms with this home's
  extensions.
- A tool call blocks on the permission extension's `confirm` until a socket
  `dialog` answer arrives, and the reply is the same `ExtensionUIContext` result
  pi's TUI would produce
  ([note](../notes/2026-10-28-rpc-permission-block.md)).
- `steer` returns ok and the steered text arrives as a user message. In one run it
  landed after `agent_settled`, so the queue survives a fast turn.
- `abort` answers every pending dialog as cancelled and settles the run.
- `bash` records its result itself, so the server re-reads the snapshot after the
  reply and again at `agent_settled`
  ([note](../notes/2026-10-28-bash-result-is-not-an-event.md)).
- `session.reload()` re-reads resources without replacing the session or its
  transcript; the socket answers `command-result { command: "reload", ok: true }`.
- The engine keeps process handles after `dispose()`, so a one-shot script needs
  `process.exit`
  ([note](../notes/2026-10-28-engine-keeps-the-process-alive.md)).
- The engine's `session.messages` includes system messages, so the snapshot filters
  them at the edge and the system prompt never reaches the browser.
- `SessionManager.create(cwd, undefined, { id })` on an unknown id keeps the id in
  memory, not a file: the JSONL appears on the first message
  ([note](../notes/2026-10-28-fresh-session-id-writes-no-file.md)).
- `JsonAgentSessionEvent` is typed public but the transform that produces it is
  not exported, so the engine carries it
  ([note](../notes/2026-10-28-tojson-is-not-exported.md)).

## Verified for Epsilon's own defaults (S13)

- The defaults are inline factories in `server/src/agent/defaults/`, registered in
  `engine.ts` after the CLI's three built-ins with `replaceable: true` and
  `builtin: true`. `builtin` is what lets a terminal disable one by name; an
  extension the operator installs wins by rule.
- A factory runs once per engine, so its state belongs in the factory body. Module
  scope would share one mode across every live session in this process.
- On a scratch home (credentials and model symlinked, settings naming only the
  provider, no `extensions/`): `permission` is in the snapshot's commands, `perm:ask`
  arrives at session start, `/permission strict` switches it, a `bash` call under
  `strict` waits on a `confirm` and is recorded as `Blocked by user: echo gate-probe`,
  and the same call under `yolo` runs with no dialog.
- A probe extension claiming `/permission` and the `permission` status key became the
  only `permission` command, with no `permission:2`, and its status won. The guard is
  dropped, not doubled.
- An inline factory exists only in the server process, so the `pi` in the terminal tab
  does not have these defaults. S7 closes that by launching the tab's `pi` with `-e`
  ([ADR-0010](../adr/0010-defaults-are-engine-only.md)).
- `discuss` registers its parameters as a zod schema converted with
  `z.toJSONSchema(schema, { io: "input" })`. pi's `ToolDefinition.parameters` is
  typed as typebox's `TSchema`, which is structurally any object, so a plain JSON
  Schema is accepted and the repo keeps one schema language. Verified with a real
  turn: the model called the tool and pi validated the arguments.
- The tool asks with `ctx.ui.select` and falls through to `ctx.ui.input` for "Type
  something.". Both branches were answered from the socket: a preset gave
  `User selected: 1. Strict` and the free-text branch gave `User wrote: …`. It never
  touches `ctx.ui.custom`, which is what a terminal-only version needs.
- An unanswered `discuss` or permission dialog has no timeout: it waits until a tab
  answers or the run is aborted, and a later tab receives it replayed.
- Readiness is `GET /api/readiness`, answered by `ModelRuntime.create()` with the
  same `auth.json` and `models.json` paths the engine uses, from `config.agentHome`.
  Nothing is cached: a `/login` in the deployment's shell changes the next answer,
  and one call costs about 4 ms. A home with no credential answers
  `{ready: false, home, detail, fix}`, which is what the browser shows instead of a
  composer.
- The not-ready notice replaces the routed page in `client/src/routes/__root.tsx`
  when the answer is `ready: false`, so no session is attached and no engine is
  built while the deployment is unconfigured.
