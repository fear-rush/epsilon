# Testing rules

### TS-1 · Run tests through the repository commands

Do: `bun run test` or the one spec; report the duration. Budgets: the 308-test suite 10 s, a targeted e2e 30 s, the full e2e 60 s.
Don't: run a spec some other way and skip the duration.
Enforced by: review

### TS-2 · Never wait with a sleep

Do: wait on an event, or on `until(...)` (`test/until.ts`) with a deadline; time comes from `TestClock`.
Don't: sleep in a test, or in a check script.
Enforced by: epsilon/no-real-sleep

### TS-3 · Every check has a deadline, stated before it starts

Do: use the guide: `bun run check` 15 s, one targeted e2e 30 s, the full e2e 60 s, one screenshot 15 s, one manual app run 60 s. A step past twice its deadline is stopped, its process killed, and the delay reported as part of the result.
Don't: wait longer; that is a finding about the code or the harness.
Enforced by: review

### TS-4 · A run over budget stops

Do: stop and report what was running.
Don't: retry blindly or raise the timeout.
Enforced by: review

### TS-5 · Run the long thing once, on the smallest input

Do: photograph one state that answers the question; report what is left.
Don't: photograph every state in one sitting.
Enforced by: review

### TS-6 · Bound anything that starts a browser or a server

Do: `bun run scripts/limit.ts <seconds> -- <command…>`; it runs the command detached, SIGKILLs its group at the deadline and captures its output. A screenshot script exits by itself: a watchdog, a deadline on every DevTools call, a kill of its own browser on every path.
Don't: use `perl -e 'alarm'` or a shell `timeout` (macOS has none, and neither kills the browser's group).
Enforced by: review

### TS-7 · Kill what you started

Do: end a server, browser or engine from a check before the next command.
Don't: leave a stray process; it is itself a failure to report.
Enforced by: review

### TS-8 · A started server or engine gets a scratch agent home

Do: set `EPSILON_AGENT_HOME` to a scratch directory for a manual run; the test preload (`test/setup.ts`) does it for tests.
Don't: point a check at the real `~/.pi`.
Enforced by: review

### TS-9 · Run the check the change calls for

Do: use the table.
Don't: skip a row's check, or run the whole suite for a CSS/copy-only batch (it may skip the 308-test suite).
Enforced by: review

| Change                                                                                                       | Check                                                      |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Any edit                                                                                                     | `bun run type-check` and `bun run lint`                    |
| One UI slice                                                                                                 | its one e2e spec, plus one screenshot read by you          |
| Batch boundary, or `src/protocol`/`src/backend`/`src/engine`/shared state/build config/more than one feature | `bun run check` plus the touched e2e specs                 |
| Before merge, or the owner asks                                                                              | full `bun run test:e2e`, `bun run parity`, `bun run bench` |

### TS-10 · Pixels and feel are read, not asserted

Do: review animations, placement and feel in a screenshot you read.
Don't: treat passing type-check, lint or a pixel assertion as proof of how it looks or feels.
Enforced by: review

### TS-11 · Screenshot a route with `bun run shoot`; an interactive state with playwright-cli

Do: `bun run build`, then `bun run shoot <route…> [--out dir]`; it starts the built server on a scratch home with the stub model, runs iris against it and waits for `data-ready="true"` on `<html>` (the socket is open, the router is idle, no query is in flight). For a dialog, a menu, hover or a stopped server, run `bun run start` on a scratch `EPSILON_AGENT_HOME` and use playwright-cli.
Don't: write a one-off Playwright, Puppeteer or Chrome script for a screenshot or a quick look.
Enforced by: review

### TS-12 · A quick inspection uses the playwright-cli skill

Do: read `~/.agents/skills/playwright-cli/SKILL.md`, then `playwright-cli open/goto/snapshot/click/screenshot/close` for what is on the page, a console error or a DOM value; close its browser when done.
Don't: leave the browser open, or point it at the real `~/.pi`.
Enforced by: review

### TS-13 · The pi agent may capture with the iris MCP tool

Do: call `capture` against a server it started on a scratch home.
Don't: capture a server running on the real agent home.
Enforced by: review

### TS-14 · A screenshot is read before it is reported

Do: open the PNG, and say in one line what it shows.
Don't: report a screenshot you did not look at.
Enforced by: review

### TS-15 · DESIGN.md is linted with Google's CLI, pinned

Do: `bunx @google/design.md@0.4.0 lint DESIGN.md` after a change to DESIGN.md; errors must be zero. The `containers` and `motion` groups are unknown keys, and the warning is expected. `bun run design --check` (in `bun run check`) keeps `tokens.gen.css` in step.
Don't: add the lint to `bun run check`; it fetches the package over the network.
Enforced by: review

## Not covered here

A check that fails for a reason you do not understand: stop and ask.
