# Plan

Status: **S1, S2 and S3 verified in a browser. S4 is active, S11 is queued.** This file answers: what the product does for its user, which slice is
being built, and whether it is done. Keep "Active slice" honest; that is the only
part that must never drift.

The checks for every slice are in [plan/slices.md](plan/slices.md). Facts that were
verified by hand are in [plan/facts.md](plan/facts.md). Scope and the not-building
list are in [features.md](features.md). Architecture is in
[architecture.md](architecture.md).

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
5. **Set it up.** I run it on a machine that has never had `pi` configured, and one
   terminal session inside it is enough to make it usable.
6. **Configure, rarely.** When I install a package or add an MCP server, I do it
   once, in a terminal, not in a settings screen.
7. **Never blocked.** I never open my laptop only to check whether a run finished.

Job 5 is new and it changed the product's shape. Until it existed, the dashboard
could only run where the operator's terminal already was
([ADR-0005](adr/0005-deployment-owns-agent-home.md)). Two things follow that
constrain every other job:

- The deployment owns its agent home, so the dashboard and the terminal inside the
  deployment share sessions, and the host's terminal no longer does.
- The dashboard does not configure pi. Setup, login and trust happen in a terminal
  inside the deployment, and the dashboard reports what is missing
  ([ADR-0006](adr/0006-setup-in-the-deployment-terminal.md)).

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
| S4  | Run a full turn (steer, abort, change model) without a terminal | active |
| S5  | Answer a permission prompt from the browser                     | todo   |
| S6  | Open a file, its diff, and insert its path into the composer    | todo   |
| S7  | Use `pi` itself in a terminal tab                               | todo   |
| S8  | See which skills, packages and MCP servers are loaded           | todo   |
| S9  | Preview what the agent built, from the phone                    | todo   |
| S10 | Get pinged when a run needs an answer                           | todo   |
| S11 | Reach the dashboard from a phone on a machine without `pi`      | todo   |

S11 serves job 5. It gates nothing on this laptop, where the dashboard already runs
against the host's own `pi`, and it comes before any deployment on a second machine.

## Active slice

**S4: Composer.** Steer, abort and the model picker are built; the palette and
`!cmd` remain. The shell from ui.md now exists: the session list lives in a
sidebar, and `/` is the empty state it leaves behind.

Next action: `!cmd`. The `bash` RPC records a result and the reducer already turns
a `bashExecution` message into a bash card, so the work is the `!` prefix in the
composer plus the `bash` command. Then the skill and prompt palette, which needs
`get_commands` in the snapshot and another protocol bump.

S11 is queued behind it because it only matters once there is a second machine. When
it starts, its first step is the same one that protects this laptop today: the Host
and Origin check, including on the socket upgrade.

## Universal done list

Every slice, in this order:

- [ ] Every check above passes, by hand, in a browser
- [ ] `bun run type-check`, `bun run lint`, `bun run build`
- [ ] No file over 300 lines, no route handler over 60
- [ ] No `@earendil-works/*` leak outside the two allowed modules
- [ ] Scaffolding from the previous slice is deleted, not commented out
- [ ] No capability claimed that pi does not expose, over RPC or through its
      exported library. Both surfaces are recorded in
      [reference/pi-rpc.md](reference/pi-rpc.md)
- [ ] This file updated: slice marked done, next slice named; the check marked in
      [plan/slices.md](plan/slices.md)
- [ ] An ADR added only if a decision changed; a note in `docs/notes/` if a trap bit
- [ ] Committed with a conventional message naming the outcome

## Risks

| Risk                             | Why it matters                                                                                                                    | Mitigation                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| The normalizer is the hard part  | Deltas, tool updates, retries and compaction must fold into one pure reducer; this is where pi-web accumulated thousands of lines | Fixtures from real traces; replay is the only test that catches ordering bugs                                  |
| pi's surface changes             | An upgrade can drop or rename an RPC command                                                                                      | Exact pin; re-verify with the greps in `reference/pi-rpc.md` before upgrading                                  |
| No policy in a fresh home        | pi core does not ask before a tool call; the permission extension is a file in a home that a new deployment does not have         | The not-ready notice names it; installing a policy is a deliberate act in the terminal, never a silent default |
| Bun + pi beyond startup          | `get_state` and one tool-using turn pass under Bun 1.4.4                                                                          | None needed; re-check after a pi upgrade                                                                       |
| Preview proxy WebSockets         | HMR dies silently without upgrade passthrough                                                                                     | Static preview first in S9; the proxy is its own step if it fights                                             |
| Extension `custom` UI            | An extension needing it is unusable in the web UI                                                                                 | Visible notice, not silence; terminal tab                                                                      |
| Two writers on one session       | pi appends to the JSONL with no lock, so two hosts on the same session interleave entries                                         | Resume sequentially; nothing guards the concurrent case yet                                                    |
| One child per opened session     | There is no idle kill, so every session ever opened keeps a process until shutdown                                                | Pool and idle timeout (`agent/pool.ts`) is still unbuilt                                                       |
| Native packages are per platform | A home built on one platform does not run its packages on another                                                                 | Install inside the deployment; `deploy.md` says so                                                             |
| A published port                 | There is no authentication in the app, by design                                                                                  | Publish on loopback and reach it through a tunnel; Host check in S11                                           |
| Scope creep into settings        | The project this replaces accumulated 20k+ lines of settings UI                                                                   | Setup stays in the terminal (ADR-0006); the dashboard only reports readiness                                   |

## Definition of done for V1

- A session started in the terminal inside the deployment can be continued from a
  phone, and both show the same messages.
- Every tool call in a real session is readable: command, output, diff, image.
- An extension prompt can be answered from the web UI.
- A run survives the tab closing, and the phone can reattach.
- A machine that has never had `pi` configured becomes usable after one terminal
  session inside the deployment, and the dashboard says so when it has not.
- A file can be opened, previewed and diffed without leaving the browser.
- Nothing in the UI claims a capability that pi does not expose, and nothing in the
  dashboard writes pi's configuration.
