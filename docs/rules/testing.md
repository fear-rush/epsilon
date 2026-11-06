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

## Not covered here

A check that fails for a reason you do not understand: stop and ask.
