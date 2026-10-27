# Plan

Status: **design, not implemented.** This file answers three questions: what the
product does for its user, what to build next, and where we are right now. Keep
the "Current state" section honest; that is the only part that must never drift.

Scope and the not-building list are in [features.md](features.md). Architecture
is in [architecture.md](architecture.md).

## Jobs

The product exists for these, in this order. If a feature does not serve one of
them, it waits.

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

## Milestones

Each milestone ends with something you can use, not something you can compile.

### M0 — Child and socket

Spawn `pi --mode rpc`, frame its stdout as JSON lines, forward raw events to one
page, print them.

**Exit criteria:** send a prompt from a browser page and see `message_start` …
`agent_settled` for a real answer. A child killed under the server is reported,
not swallowed. A full turn with at least one tool call, on Bun, is recorded here
as passing or failing. **Files:** `agent/driver.ts`, `ws/*`, `share` of nothing
yet. No React changes.

### M1 — Reducer

`shared/conversation/{state,reduce,selectors}.ts` plus fixtures recorded from M0.

**Exit criteria:** replaying a recorded fixture produces the same transcript
twice, and a second fixture that reconnects mid-stream resumes without duplicated
or missing entries. No React code in the reducer (lint-enforced).

### M2 — Transcript

`components/chat/*`: `MessageScroller` per turn, entry-kind map, `Trace` tool
rows, `CodeBlock` output, generic fallback for unknown and MCP tools, notices as
`Marker`, thinking as a collapsible trace line.

**Exit criteria:** you can read a real coding session with `bash`, `read`, `edit`
and `write` calls, on a phone width, with no horizontal scrolling and no layout
jump while streaming. Component choices follow [ui.md](ui.md).

### M3 — Sessions and sockets

`attach`/`snapshot` flow, session list grouped by project, running and
needs-input badges, open/close tabs, REST for the session file.

**Exit criteria:** open a session created by the terminal `pi`, steer it, close
the tab, reply from a second device. Start a session from the UI and see it appear
in `pi`'s session list.

### M4 — Composer and dialogs

Prompt, steer, follow-up, abort, queue, slash palette from `get_commands`, model
and reasoning pickers, context usage, `!command`, the nine extension dialog
methods.

**Exit criteria:** drive a full turn with a permission prompt and a model change,
and interrupt a running turn, all without touching a terminal.

### M5 — Files, terminal, resources

Read-only file tree and viewers, git diff, terminal tab running real `pi`,
resources page (read-only).

**Exit criteria:** you stop opening a terminal for daily work. The terminal tab is
used only for settings, login, trust and installs.

### M6 — Preview

Second origin, sandboxed iframe, `Preview` / `Source` / `Diff` tabs, static files
first, then the dev-server proxy with WebSocket passthrough.

**Exit criteria:** ask the agent to build a page, open it from the phone, see it
update. Confirm the previewed page cannot call the API (fetch from the preview
origin fails).

### M7 — Notifications and polish

Needs-input and turn-end notifications, reconnect polish, keyboard shortcuts,
error surfaces.

**Exit criteria:** put the phone down mid-run, get pinged when it needs input,
answer and finish it from the phone.

## Current state

- Code: the starter template only (AI SDK demo chat, CommandCode models,
  hand-written OpenAPI). Nothing in this plan is implemented.
- Next action: **M0**. Record a real `pi --mode rpc` trace on Bun first, including
  one tool call, and commit it under `shared/src/conversation/fixtures/`.
- Known gaps from the design: none verified wrong yet; `docs/reference/pi-rpc.md`
  is the page that goes stale first.

## Risks

| Risk                             | Why it matters                                                                                                                             | Mitigation                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| The normalizer is the hard part  | Assembling message deltas, tool updates, retries and compaction into a pure reducer is exactly where pi-web accumulated thousands of lines | Reducer first, fixtures from real traces, replay as the only test                |
| pi's RPC surface changes         | An upgrade can silently drop or rename a command                                                                                           | Exact pin; re-verify with the commands in `reference/pi-rpc.md` before upgrading |
| Bun + pi untested beyond startup | `get_state` answered, nothing else was proven                                                                                              | M0 does not end until a tool-using turn passes, or Node is chosen for the child  |
| Preview proxy WebSockets         | HMR dies silently without upgrade passthrough                                                                                              | Ship static preview in M6; treat the proxy as its own milestone if it fights     |
| Extension `custom` UI            | An extension that needs it is unusable in the web UI                                                                                       | Visible notice, not silence; terminal tab                                        |
| Scope creep into settings forms  | 20k+ lines in the project this replaces                                                                                                    | The terminal tab is the settings UI; ADR-0002                                    |

## Definition of done for V1

- A session started in the terminal can be continued from a phone and shows the
  same messages in both places.
- Every tool call in a real session is readable: command, output, diff, image.
- An extension prompt can be answered from the web UI.
- A run survives the tab closing, and the phone can reattach to it.
- A file can be opened, previewed and diffed without leaving the browser.
- Nothing in the UI claims a capability that `reference/pi-rpc.md` says is
  interactive-only.
