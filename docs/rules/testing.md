# Testing rules

Filled by step 03.

## To reshape

- Run tests through `bun run test` or the one spec; report the duration. The 308-test
  suite budget is 10 s, a targeted e2e 30 s, the full e2e 60 s.
- Never wait with a sleep. Wait on an event, or on `until(...)` with a deadline. If a run
  exceeds its budget, stop and report what was running; do not retry blindly and do not
  raise the timeout.
- **Every check has a deadline, stated before you start it.** The guide: `bun run check`
  15 s, one targeted e2e 30 s, the full e2e 60 s, one screenshot 15 s, one manual app run
  60 s. A step that passes twice its deadline is stopped, its process killed, and the delay
  reported as part of the result. Waiting longer is a finding about the code or the harness,
  not something to sit through.
- Run the long thing once, on the smallest input that proves the point. Do not photograph
  every state in one sitting when one state answers the question; report what is left.
- Bound anything that starts a browser or a server with
  `bun run scripts/limit.ts <seconds> -- <command…>`. It runs the command detached,
  SIGKILLs its group at the deadline, and captures its output, so a browser that outlives
  its script cannot hold the caller's pipe open. Do not use `perl -e 'alarm'` or a shell
  `timeout`: macOS has none, and neither kills the browser's group. A screenshot script
  must also exit by itself: a watchdog, a deadline on every DevTools call, and a kill of its
  own browser on every path.
- Kill what you started: a server, a browser or an engine from a check is gone before the
  next command, and a stray process is itself a failure to report.
- A check that starts a server or an engine sets `EPSILON_AGENT_HOME` to a scratch
  directory. The test preload does this for tests; do it yourself for a manual run.

### Check by change

| Change                                                                                                       | Check                                                      |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Any edit                                                                                                     | `bun run type-check` and `bun run lint`                    |
| One UI slice                                                                                                 | its one e2e spec, plus one screenshot read by you          |
| Batch boundary, or `src/protocol`/`src/backend`/`src/engine`/shared state/build config/more than one feature | `bun run check` plus the touched e2e specs                 |
| Before merge, or the owner asks                                                                              | full `bun run test:e2e`, `bun run parity`, `bun run bench` |

A CSS/copy-only batch may skip the 308-test suite. Animations, placement and feel are
reviewed in the screenshot, not asserted.
