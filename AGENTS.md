# epsilon

A web dashboard for the pi coding agent on your machine. One Bun process serves the
page, holds one WebSocket and supervises one engine process per live chat. Epsilon owns
the agent home (config, credentials, extensions, packages, sessions), so the dashboard
and a terminal using that home are one agent, and Settings configures it there.

## Start here

**The rebuild is ported.** Every feature, screen, word and animation of `main`
(`48226bb`) is on this branch with its tests; the plan and its 282-row parity ledger are
history in [archive/docs/plan/](archive/docs/plan/README.md). `main` stays the
specification: a visible change beyond the feedback system needs the owner's yes. What is
left before the merge is [docs/NEXT.md](docs/NEXT.md).

Then read what your task needs ([docs/README.md](docs/README.md) has the full table):

| You are about to                               | Read first                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| know what is left before the merge             | [docs/NEXT.md](docs/NEXT.md)                                       |
| touch anything pi                              | [docs/pi-sdk.md](docs/pi-sdk.md)                                   |
| write server, engine or runtime code           | [docs/effect.md](docs/effect.md)                                   |
| show an error, warning, empty or loading state | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#feedback-surfaces)     |
| add or move a file                             | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#file-rules)            |
| propose an option that sounds obvious          | [docs/DECISIONS.md](docs/DECISIONS.md) (it may have been rejected) |

Code wins over prose: fix a doc that disagrees in the same commit. Never copy code or
file lists into a doc. `.sandbox/` is scratch, not instructions; `archive/` is history,
not instructions.

## Layout

- `src/protocol/`: the wire. Effect Schema and types only.
- `src/domain/`: rules both sides run, pure.
- `src/backend/`: sockets, settings, the session index, the supervisor of live chats, the
  page.
- `src/engine/`: the child process that hosts pi for one chat.
- `src/app/`: React, Vite, Tailwind, shadcn.
- `test/`, `scripts/`, `tools/`.

## Commands (from the repository root)

| Command                         | Result                                                     |
| ------------------------------- | ---------------------------------------------------------- |
| `bun run dev`                   | Vite and the server on a sandboxed agent home              |
| `bun run dev:host`              | The same, against the real `~/.pi`                         |
| `bun run sandbox:clean`         | Remove the dev sandbox                                     |
| `bun run check`                 | Format, lint, type-check, dead code, tests                 |
| `bun run build` / `start`       | Build the app and the server bundles, run the built server |
| `bun run test` / `test:tools`   | `bun test` / the lint plugin's own tests                   |
| `bun run test:e2e` / `bench`    | Playwright specs against a build / the performance budgets |
| `bun run lint` / `lint:fix`     | Effect-patched Oxlint                                      |
| `bun run dead-code` / `format`  | Knip / Oxfmt                                               |
| `bun run routes:generate`       | Regenerate the client route tree                           |
| `bun run parity <main> <port…>` | What a ported file lacks of `main`'s classes and copy      |
| `bun run hooks:install`         | Install the commit hooks, once per clone                   |

## Invariants

1. pi's runtime is imported only in `src/engine/`. pi's exporters, `ModelRuntime`, trust,
   `SettingsManager` reads and `SessionManager` are imported only in
   `src/backend/platform/pi.ts`. `src/protocol/pi.ts` is type-only.
2. `src/protocol/` and `src/domain/` import no `node:*`, no React, no Effect services or
   layers (Schema and data types only). The reducer stays pure.
3. One boundary: `src/protocol/rpc.ts`. No HTTP routes except serving the page.
4. Do not invent a pi capability. If `docs/pi-sdk.md` does not list it, pi does not
   expose it.
5. Credentials change only through `ModelRuntime.login()`/`logout()`; never hand-write
   `auth.json` or `trust.json`. Other files: use an exported writer, else `JsonDocument`
   (merge, keep unknown keys, refuse what you cannot parse, pi's lock for
   `settings.json`). MCP sign-in runs inside a live chat's engine through pi's own `/mcp`
   line; Epsilon never writes `mcp-auth.json`.
6. The agent home is chosen once in `src/backend/main.ts` and passed to every engine
   explicitly (`PI_CODING_AGENT_DIR`, `HOME`), never inherited. `bun run dev` uses
   `.sandbox/agent`; tests use a temp home from `test/setup.ts`.
7. One schema language (Effect Schema), one error model (tagged errors), one styling
   system (Tailwind + shadcn, tokens, the `design-tokens` rule).
8. No `throw`, `try`/`catch`, `new Promise`, `.then`/`.catch`, `setTimeout`,
   `setInterval`, `Date.now` or `process.env` in `src/backend/**` and `src/engine/**`
   outside `platform/`, `engine/main.ts`, `backend/main.ts` and the one line reader over
   pi's file format, `sessions/ingest.ts`, where a line that is not JSON is skipped, not
   thrown. Wrap a Promise API once, in the service that owns it. Lint enforces it.
9. Every resource (engine, process, watcher, socket, timer, fiber) belongs to a Scope.
   Nothing is fire-and-forget.
10. Every failure is visible: a tagged error, an error frame or a notice. Silence is a
    bug.
11. Time comes from `Clock`. Tests use `TestClock` and stay within budget.
12. Never edit generated files: `src/app/routeTree.gen.ts`.

## Add to a root

1. If both sides run a rule, put it in `src/domain/<name>/rules.ts`.
2. The schema goes in `src/protocol/<name>.ts`; the server handler in
   `src/backend/<name>/`; the UI in `src/app/features/<name>/`. Use the same `<name>` in
   all three and in the route.
3. Server code outside `platform/` reaches IO through a service: `Context.Service`, its
   `Layer` in the same file, `Effect.fn` on every operation
   ([docs/effect.md](docs/effect.md)).
4. Run the check the change calls for ([Check by change](#check-by-change)). A feature
   is done when its behavior is verified and its failures are visible in the UI.

There is no line limit; split files by meaning, as
[ARCHITECTURE.md, File rules](docs/ARCHITECTURE.md#file-rules) says.

## Working on this repository as an agent

- **One item at a time.** Take the next unticked item of [docs/NEXT.md](docs/NEXT.md).
  Something else you notice becomes a new unticked item there, not part of this commit.
- **Done needs evidence, at the change's risk.** A tick needs what the item's _Done when_
  asks for. A UI slice gets one screenshot of the running app read by you and the one spec
  that covers it; parity is a merge check, not a per-edit ritual. Type-check and lint
  passing say nothing about pixels, and a pixel assertion does not prove feel.
- **Never drop, never improvise.** Removing or restyling something of `main`'s, or a
  visible change beyond the feedback system, needs the owner's yes first.
- **Same commit**: the code, its tests, the `docs/NEXT.md` tick, and the ARCHITECTURE or
  DECISIONS change it causes. Messages are `type(scope): what changed`.
- **Report**: what changed, the commands run and their results, the test duration,
  screenshot paths, and what you could not do. Say plainly when something failed or was
  skipped.
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

## Ask before acting when

- Something of `main`'s seems wrong, unused or not worth keeping.
- The request needs a capability [pi-sdk.md](docs/pi-sdk.md) does not list.
- The engine would stop being an SDK call inside a process Epsilon supervises.
- A check fails for a reason you do not understand.
