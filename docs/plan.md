# Plan

Status: **design, not implemented.** This file answers: what the product does for
its user, which slice is being built, and whether it is done. Keep "Active slice"
honest; that is the only part that must never drift.

Scope and the not-building list are in [features.md](features.md). Architecture is
in [architecture.md](architecture.md).

## Jobs

The product exists for these, in this order. If a feature does not serve one, it
waits.

1. **Continue.** I start a task at my desk, walk away, open the same session on my
   phone, and steer it.
2. **Inspect.** I see what the agent did — commands, edits, diffs, images,
   notices — without scrolling a terminal.
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

| #   | Outcome you can see                                               | Status |
| --- | ----------------------------------------------------------------- | ------ |
| S1  | Type a prompt, watch a real answer stream in                      | todo   |
| S2  | Read a terminal-created session on a phone, tool calls and all    | todo   |
| S3  | Browse sessions, resume one, close the tab, come back             | todo   |
| S4  | Run a full turn — steer, abort, change model — without a terminal | todo   |
| S5  | Answer a permission prompt from the browser                       | todo   |
| S6  | Open a file, its diff, and insert its path into the composer      | todo   |
| S7  | Use `pi` itself in a terminal tab                                 | todo   |
| S8  | See which skills, packages and MCP servers are loaded             | todo   |
| S9  | Preview what the agent built, from the phone                      | todo   |
| S10 | Get pinged when a run needs an answer                             | todo   |

Checks are written to be run by hand, in this order, on a phone where the slice
says so. A slice is not done because it compiles.

### S1 — One live turn

Spawn `pi --mode rpc`, frame its stdout, one WebSocket, a textarea and a raw event
list. Ugly on purpose.

- [ ] A prompt sent from the browser streams a real answer back, incrementally
- [ ] Kill the child mid-stream: the page reports the agent exited, no silence
- [ ] A tool-using turn is recorded and committed to
      `shared/src/conversation/fixtures/`
- [ ] `@earendil-works/*` is imported only in `server/src/agent/` and
      `shared/src/pi.ts` (a `grep` proves it; the lint rule is in place)

### S2 — Transcript

Reducer plus renderers, driven by the fixture first, then live.

- [ ] A session created in the terminal `pi` is readable in the browser
- [ ] On a phone width: no horizontal scrolling, no layout jump while streaming
- [ ] A `bash` card shows command and output; an `edit` shows a diff; an image
      result shows the image
- [ ] A tool name with no renderer still renders (generic fallback, never blank)
- [ ] Replaying a recorded fixture twice yields an identical transcript

### S3 — Sessions and resume

- [ ] Sessions are grouped by project; a running one shows a badge
- [ ] Open a session the CLI created, steer it, and the CLI shows the same messages
- [ ] Close the tab mid-run, reopen it, and the run has continued
- [ ] Deleting a session from the UI removes it from `pi`'s list too

### S4 — Composer

- [ ] Steer mid-run and see the message land in the transcript
- [ ] Abort, and the run stops in the CLI as well
- [ ] Change model; the next turn uses it, and `get_state` in the CLI agrees
- [ ] An installed skill or prompt template appears in the palette and runs
- [ ] `!ls` runs a shell command and its output is in the transcript

### S5 — Extension dialogs

- [ ] A permission prompt appears in the browser; approving continues the run
- [ ] A second tab cannot answer the same prompt twice
- [ ] Reload the page while a prompt is pending: it is shown again
- [ ] An extension using `ctx.ui.custom` shows the unsupported notice and points
      at the terminal tab (never silence)

### S6 — Files and diff

- [ ] Browse the project tree; open a source file, an image and a CSV
- [ ] A path outside the project is refused with `PATH_NOT_ALLOWED`
- [ ] Open the diff of the file the agent just edited
- [ ] Insert a file path into the composer with `@`

### S7 — Terminal

- [ ] `pi` itself runs in the terminal tab; `/login` and `/settings` work
- [ ] Resize works, and the touch key row types Esc, Tab and Ctrl+C
- [ ] Closing the tab kills the pty: `pgrep -f pi` shows no orphan

### S8 — Resources

- [ ] Skills, packages and MCP servers are listed with scope and source path
- [ ] Install a package in the terminal tab, restart the session, and its tool
      appears in the browser
- [ ] Nothing on this page writes

### S9 — Preview

- [ ] Preview an HTML file the agent wrote, from the phone
- [ ] A dev server started by the agent is previewable, and edits hot-reload
- [ ] The previewed page cannot read the API (`fetch` fails from the frame)
- [ ] Preview / Source / Diff tabs agree with each other

### S10 — Notifications

- [ ] With a pending prompt and no open tab, a notification arrives on the phone
- [ ] A finished run notifies once, not once per message
- [ ] Opening the notification lands on the right session

## Active slice

**S1 — One live turn.** Not started.

Next action: spawn `pi --mode rpc`, print raw stdout lines in a terminal, then wire
the socket. Do not start framing abstraction work before one real trace exists.

Known open risk for this slice: a full tool-using turn under Bun is unproven. If it
fails, run the child under Node (`PI_RUNTIME=node`) and record why in
`docs/notes/`.

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
| Bun + pi beyond startup         | `get_state` answered; nothing else proven                                                                                         | S1 does not end until a tool-using turn passes, or Node is chosen             |
| Preview proxy WebSockets        | HMR dies silently without upgrade passthrough                                                                                     | Static preview first in S9; the proxy is its own step if it fights            |
| Extension `custom` UI           | An extension needing it is unusable in the web UI                                                                                 | Visible notice, not silence; terminal tab                                     |
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
