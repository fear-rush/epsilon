# epsilon

A web dashboard for the pi coding agent on your machine. One Bun process serves the
page, holds one WebSocket and supervises one engine process per live chat. Epsilon owns
the agent home (config, credentials, extensions, packages, sessions), so the dashboard
and a terminal using that home are one agent, and Settings configures it there.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first, [docs/pi-sdk.md](docs/pi-sdk.md)
before touching anything pi, [docs/effect.md](docs/effect.md) before writing server,
engine or runtime code, and [docs/DECISIONS.md](docs/DECISIONS.md) for why. Code wins
over prose; fix a doc that disagrees in the same commit, and never copy code or file
lists into a doc.

## Layout

- `src/protocol/`: the wire. Effect Schema and types only.
- `src/domain/`: rules both sides run, pure.
- `src/backend/`: sockets, configuration, catalog, supervisor, the page.
- `src/engine/`: the child process that hosts pi for one chat.
- `src/app/`: React, Vite, Tailwind, shadcn.
- `test/`, `scripts/`, `tools/`.

## Commands (from the repository root)

| Command                        | Result                                                     |
| ------------------------------ | ---------------------------------------------------------- |
| `bun run dev`                  | Vite and the server on a sandboxed agent home              |
| `bun run dev:host`             | The same, against the real `~/.pi`                         |
| `bun run sandbox:clean`        | Remove the dev sandbox                                     |
| `bun run check`                | Format, lint, type-check, dead code, tests                 |
| `bun run build` `/` `start`    | Build the app and the server bundles, run the built server |
| `bun run test` / `test:tools`  | `bun test` / the lint plugin's own tests                   |
| `bun run lint` / `lint:fix`    | Effect-patched Oxlint                                      |
| `bun run dead-code` / `format` | Knip / Oxfmt                                               |
| `bun run routes:generate`      | Regenerate the client route tree                           |
| `bun run hooks:install`        | Install the commit hooks, once per clone                   |

## Invariants

1. pi's runtime is imported only in `src/engine/`. pi's exporters, `ModelRuntime`, trust
   and `SettingsManager` reads are imported only in `src/backend/platform/pi.ts`.
   `src/protocol/pi.ts` is type-only.
2. `src/protocol/` and `src/domain/` import no `node:*`, no React, no Effect services or
   layers (Schema and data types only). The reducer stays pure.
3. One boundary: `src/protocol/rpc.ts`. No HTTP routes except serving the page.
4. Do not invent a pi capability. If `docs/pi-sdk.md` does not list it, pi does not
   expose it.
5. Credentials change only through `ModelRuntime.login()`/`logout()`; never hand-write
   `auth.json` or `trust.json`. Other files: use an exported writer, else `JsonDocument`
   (merge, keep unknown keys, refuse what you cannot parse, pi's lock for
   `settings.json`). MCP sign-in stays in the terminal.
6. The agent home is chosen once in `src/backend/main.ts` and passed to the catalog worker
   and every engine explicitly (`PI_CODING_AGENT_DIR`, `HOME`), never inherited.
   `bun run dev` uses `.sandbox/agent`; tests use a temp home from `test/setup.ts`.
7. One schema language (Effect Schema), one error model (tagged errors), one styling
   system (Tailwind + shadcn, tokens, the `design-tokens` rule).
8. No `throw`, `try`/`catch`, `new Promise`, `.then`/`.catch`, `setTimeout`,
   `setInterval`, `Date.now` or `process.env` in `src/backend/**` and `src/engine/**`
   outside `platform/`, `engine/main.ts` and `server/main.ts`. Wrap a Promise API once, in
   the service that owns it. Lint enforces it.
9. Every resource (engine, process, watcher, socket, timer, fiber) belongs to a Scope.
   Nothing is fire-and-forget.
10. Every failure is visible: a tagged error, an error frame or a notice. Silence is a
    bug.
11. Time comes from `Clock`. Tests use `TestClock` and stay within budget.
12. Never edit generated files: `src/app/routeTree.gen.ts`.

## Add to a root

1. If both sides run a rule, put it in `src/domain/<name>/rules.ts`.
2. The schema goes in `src/protocol/<name>.ts`; the server handler in
   `src/backend/<name>/`; the UI in `src/app/features/<name>/`.
3. Server code outside `platform/` reaches IO through a service: `Context.Service`, its
   `Layer` in the same file, `Effect.fn` on every operation
   ([docs/effect.md](docs/effect.md)).
4. Rerun `bun run check`. A feature is done when its tests pass and its failures are
   visible in the UI.

There is no line limit; split files by meaning, as
[ARCHITECTURE.md, File rules](docs/ARCHITECTURE.md#file-rules) says.

## Working on this repository as an agent

- Run tests through `bun run test` or a bounded command; report the duration. The suite
  budget is 10 s.
- Never wait with a sleep. Wait on an event, or on `until(...)` with a deadline. If a run
  exceeds its budget, stop and report what was running; do not retry blindly and do not
  raise the timeout.
- A check that starts a server or an engine sets `EPSILON_AGENT_HOME` to a scratch
  directory. The test preload does this for tests; do it yourself for a manual run.
- Time in code comes from `Clock`; in tests from `TestClock`.

## Ask before acting when

- The request needs a capability [pi-sdk.md](docs/pi-sdk.md) does not list.
- The engine would stop being an SDK call inside a process Epsilon supervises.
- A check fails for a reason you do not understand.
