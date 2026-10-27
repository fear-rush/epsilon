# Plan

Status: **S1, S2 and S3 verified in a browser. S4 is next.** This file answers:
what the product does for its user, which slice is being built, and whether it is
done. Keep "Active slice" honest; that is the only part that must never drift.

Scope and the not-building list are in [features.md](features.md). Architecture is
in [architecture.md](architecture.md).

## Jobs

The product exists for these, in this order. If a feature does not serve one, it
waits.

1. **Continue.** I start a task at my desk, walk away, open the same session on my
   phone, and steer it.
2. **Inspect.** I see what the agent did (commands, edits, diffs, images,
   notices) without scrolling a terminal.
3. **Oversee.** I get notified when it needs an answer, and I can answer from
   wherever I am.
4. **Verify.** I look at what it built and read the diff before I accept it.
5. **Configure, rarely.** When I install a package or sign in to a provider, I do
   it once, in the terminal tab.
6. **Never blocked.** I never open my laptop only to check whether a run finished.

## How a slice works

A slice is one user-visible outcome taken end to end: data source → socket or REST
→ reducer → UI. It ends when you can perform its checks yourself in a browser. No
slice lasts more than about two days; if it does, cut it, and the cut line is
almost always "read-only version first".

One slice at a time. A slice is finished when its checks pass **and** the
[universal done list](#universal-done-list) passes. Then commit and mark it done.

The only horizontal work allowed is folded into S1: you cannot demo anything
without a child process and a socket.

## Slices

| #   | Outcome you can see                                             | Status |
| --- | --------------------------------------------------------------- | ------ |
| S1  | Type a prompt, watch a real answer stream in                    | done   |
| S2  | Read a terminal-created session on a phone, tool calls and all  | done   |
| S3  | Browse sessions, resume one, close the tab, come back           | done   |
| S4  | Run a full turn (steer, abort, change model) without a terminal | todo   |
| S5  | Answer a permission prompt from the browser                     | todo   |
| S6  | Open a file, its diff, and insert its path into the composer    | todo   |
| S7  | Use `pi` itself in a terminal tab                               | todo   |
| S8  | See which skills, packages and MCP servers are loaded           | todo   |
| S9  | Preview what the agent built, from the phone                    | todo   |
| S10 | Get pinged when a run needs an answer                           | todo   |

Checks are written to be run by hand, in this order, on a phone where the slice
says so. A slice is not done because it compiles.

### S1: One live turn

Spawn `pi --mode rpc`, frame its stdout, one WebSocket, a textarea and a raw event
list. Ugly on purpose.

- [x] A prompt sent from the browser streams a real answer back, incrementally
- [x] Kill the child mid-stream: the page reports the agent exited, no silence
- [x] A tool-using turn is recorded and committed to
      `shared/src/conversation/fixtures/`
- [x] `@earendil-works/*` is imported only in `server/src/agent/` and
      `shared/src/pi.ts` (a `grep` proves it; no lint rule exists yet)

### S2: Transcript

Reducer plus renderers, driven by the fixture first, then live.

- [x] A session created in the terminal `pi` is readable in the browser
- [x] On a phone width: no horizontal scrolling, no layout jump while streaming
- [x] A `bash` card shows command and output; an `edit` shows a diff; an image
      result shows the image
- [x] A tool name with no renderer still renders (generic fallback, never blank)
- [x] Replaying a recorded fixture twice yields an identical transcript

### S3: Sessions and resume

- [x] The project's sessions are listed newest first; a live child shows a
      running badge and a pending dialog shows a needs-input badge
- [x] Open a session the CLI created, steer it, and the CLI shows the same messages
- [x] Close the tab mid-run, reopen it, and the run has continued
- [x] Deleting a session from the UI removes it from `pi`'s list too

### S4: Composer

Steer and abort are built: while a turn runs the composer turns into steer and
stop, Esc stops from the textarea, and a refused command becomes a notice. Model
switching, the palette and `!cmd` are not started.

- [ ] Steer mid-run and see the message land in the transcript (checked over the
      socket: `steer` answered ok, its text arrived as a user message, and the
      turn ended with it; the buttons are not yet checked in a browser)
- [ ] Abort, and the run stops in the CLI as well (checked over the socket:
      `abort` answered ok, then `message_end`, `turn_end`, `agent_end` and
      `agent_settled`)
- [ ] Change model; the next turn uses it, and `get_state` in the CLI agrees
- [ ] An installed skill or prompt template appears in the palette and runs
- [ ] `!ls` runs a shell command and its output is in the transcript

### S5: Extension dialogs

- [ ] A permission prompt appears in the browser; approving continues the run
- [ ] A second tab cannot answer the same prompt twice
- [ ] Reload the page while a prompt is pending: it is shown again
- [ ] An extension using `ctx.ui.custom` shows the unsupported notice and points
      at the terminal tab (never silence)

### S6: Files and diff

- [ ] Browse the project tree; open a source file, an image and a CSV
- [ ] A path outside the project is refused with `PATH_NOT_ALLOWED`
- [ ] Open the diff of the file the agent just edited
- [ ] Insert a file path into the composer with `@`

### S7: Terminal

- [ ] `pi` itself runs in the terminal tab; `/login` and `/settings` work
- [ ] Resize works, and the touch key row types Esc, Tab and Ctrl+C
- [ ] Closing the tab kills the pty: `pgrep -f pi` shows no orphan

### S8: Resources

- [ ] Skills, packages and MCP servers are listed with scope and source path
- [ ] Install a package in the terminal tab, restart the session, and its tool
      appears in the browser
- [ ] Nothing on this page writes

### S9: Preview

- [ ] Preview an HTML file the agent wrote, from the phone
- [ ] A dev server started by the agent is previewable, and edits hot-reload
- [ ] The previewed page cannot read the API (`fetch` fails from the frame)
- [ ] Preview / Source / Diff tabs agree with each other

### S10: Notifications

- [ ] With a pending prompt and no open tab, a notification arrives on the phone
- [ ] A finished run notifies once, not once per message
- [ ] Opening the notification lands on the right session

## Active slice

**S4: Composer.** Steer and abort are built; their browser checks and three
controls remain.

Next action: the model picker. `get_available_models` lists the choices,
`set_model` switches, and the snapshot's `model` and `thinkingLevel` say what is
current. Confirm in the CLI on the same session, because the socket forwards only
`ok`/`error` and drops pi's response data.

## Facts worth keeping

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
  ([notes/2026-10-28-strictmode-closes-the-socket.md](notes/2026-10-28-strictmode-closes-the-socket.md)).
- The agent's project is `config.projectDir`: `EPSILON_PROJECT` or the repo root,
  never `process.cwd()`, because `turbo dev` starts the server task inside
  `server/` and pi reads that as the project
  ([notes/2026-10-28-turbo-runs-the-agent-in-server.md](notes/2026-10-28-turbo-runs-the-agent-in-server.md)).
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
  ([notes/2026-10-28-fresh-session-id-writes-no-file.md](notes/2026-10-28-fresh-session-id-writes-no-file.md)).
- Delete resolves the id with `SessionManager.findById` and refuses while the
  registry holds a live child. A real id from another project answers `404` and
  leaves the file alone, so the temp-project test could not touch this repo's
  sessions.
- No idle kill: a child stays alive after its last tab closes, so browsing many
  sessions leaves one `pi` per session until the server stops.
- The list badges poll `/api/sessions` every 5 s; a session running only in the
  terminal shows no badge, because pi keeps no lock and appends to the JSONL
  without one.
- `meta.running` means the child process is alive; `busy` means a turn is
  running. `busy` comes from `agent_start`/`agent_end` and from the snapshot's
  `isStreaming`, so a tab that attaches mid-run shows "working" and offers stop
  instead of looking idle.
- pi's `steer` lands at the next turn boundary, not mid-token: a count that was
  steered at 38 characters still ran to 300 before "steered-ok" appeared. The
  composer says "steer" for that reason.
- The socket's `rpc-result` carries only `ok`/`error`, so pi's response data (the
  steer disposition, `get_state`, the chosen model) never reaches the browser. A
  refused command becomes a notice with its error text.
- The tab settles a turn twice: `agent_end` then `agent_settled`. Both clear
  `busy`; `abort` produces `message_end`, `turn_end`, `agent_end` and
  `agent_settled`, so a stopped turn keeps its partial text.

Resolved risks for S1 and S2:

- pi's shipped `RpcClient` cannot answer an extension dialog and reports no
  child exit, so the driver is ours ([ADR-0004](adr/0004-own-the-rpc-driver.md)).
- A child that dies on its own and a child we stopped are told apart by
  `onExit.requested`. Verified with SIGKILL and SIGTERM.
- A spawn failure emits no `exit` event, so the driver reports it as an exit
  with `code: null`. Verified with a nonexistent `cwd`.
- Bun runs a full tool-using turn, so `PI_RUNTIME=node` is not needed.
- A tool call blocks on the permission extension's `confirm` until something
  answers it
  ([notes/2026-10-28-rpc-permission-block.md](notes/2026-10-28-rpc-permission-block.md)).
- `get_messages` returns system messages even though the wire event type excludes
  them, so the snapshot filters them at the edge and the system prompt never
  reaches the browser.
- `--session-id` on an unknown id creates the session in memory, not a file: the
  JSONL appears on the first message. The driver still takes an explicit
  `SessionTarget` instead of letting a default decide which file to touch
  ([notes/2026-10-28-fresh-session-id-writes-no-file.md](notes/2026-10-28-fresh-session-id-writes-no-file.md)).

## Universal done list

Every slice, in this order:

- [ ] Every check above passes, by hand, in a browser
- [ ] `bun run type-check`, `bun run lint`, `bun run build`
- [ ] No file over 300 lines, no route handler over 60
- [ ] No `@earendil-works/*` leak outside the two allowed modules
- [ ] Scaffolding from the previous slice is deleted, not commented out
- [ ] No new capability that [reference/pi-rpc.md](reference/pi-rpc.md) does not list
- [ ] `docs/plan.md` updated: slice marked done, next slice named
- [ ] An ADR added only if a decision changed; a note in `docs/notes/` if a trap bit
- [ ] Committed with a conventional message naming the outcome

## Risks

| Risk                            | Why it matters                                                                                                                    | Mitigation                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| The normalizer is the hard part | Deltas, tool updates, retries and compaction must fold into one pure reducer; this is where pi-web accumulated thousands of lines | Fixtures from real traces; replay is the only test that catches ordering bugs |
| pi's RPC surface changes        | An upgrade can drop or rename a command                                                                                           | Exact pin; re-verify with the greps in `reference/pi-rpc.md` before upgrading |
| Bun + pi beyond startup         | `get_state` and one tool-using turn pass under Bun 1.4.4                                                                          | None needed; re-check after a pi upgrade                                      |
| Preview proxy WebSockets        | HMR dies silently without upgrade passthrough                                                                                     | Static preview first in S9; the proxy is its own step if it fights            |
| Extension `custom` UI           | An extension needing it is unusable in the web UI                                                                                 | Visible notice, not silence; terminal tab                                     |
| Two writers on one session      | pi appends to the JSONL with no lock, so the terminal and a browser child on the same session would interleave entries            | Resume sequentially; nothing guards the concurrent case yet                   |
| One child per opened session    | There is no idle kill, so every session ever opened keeps a `pi` process until shutdown                                           | Pool and idle timeout (`agent/pool.ts`) is still unbuilt                      |
| Scope creep into settings forms | 20k+ lines in the project this replaces                                                                                           | The terminal tab is the settings UI (ADR-0002)                                |

## Definition of done for V1

- A session started in the terminal can be continued from a phone, and both show
  the same messages.
- Every tool call in a real session is readable: command, output, diff, image.
- An extension prompt can be answered from the web UI.
- A run survives the tab closing, and the phone can reattach.
- A file can be opened, previewed and diffed without leaving the browser.
- Nothing in the UI claims a capability that `reference/pi-rpc.md` calls
  interactive-only.
