# epsilon

A web dashboard for the pi coding agent: one Bun process, one WebSocket, one engine
process per live chat. Epsilon owns the agent home (config, credentials, extensions,
packages, sessions), so the dashboard and a terminal using that home are one agent.

## Map

`src/protocol/` the wire (Effect Schema, types only); `src/domain/` pure rules both sides
run; `src/backend/` sockets, settings, sessions, the supervisor, the page; `src/engine/`
the child process that hosts pi for one chat; `src/app/` React, Vite, Tailwind, shadcn;
`test/`, `scripts/`, `tools/`. Details: `docs/map.md`.

## Invariants

1. pi's runtime is imported only in `src/engine/`. pi's exporters, `ModelRuntime`, trust,
   `SettingsManager` reads and `SessionManager` only in `src/backend/platform/pi.ts`.
   `src/protocol/` imports nothing from pi.
2. `src/protocol/` and `src/domain/` import no `node:*`, React, or Effect services or
   layers (Schema and data types only). The reducer stays pure.
3. One boundary: `src/protocol/rpc.ts`. No HTTP routes except serving the page.
4. Do not invent a pi capability. If `docs/pi/` does not list it, pi does not expose it.
5. Credentials change only through `ModelRuntime.login()`/`logout()`; never hand-write
   `auth.json` or `trust.json`. Other files: an exported writer, else `JsonDocument`
   (merge, keep unknown keys, refuse what you cannot parse, pi's lock for `settings.json`).
   MCP sign-in runs in a chat's engine via pi's `/mcp`; never write `mcp-auth.json`.
6. The agent home is chosen once in `src/backend/main.ts` and passed to every engine
   explicitly (`PI_CODING_AGENT_DIR`, `HOME`), never inherited. Dev: `.sandbox/agent`.
7. One schema language (Effect Schema), one error model (tagged errors), one styling system
   (Tailwind + shadcn, tokens, the `design-tokens` rule).
8. In `src/backend/**` and `src/engine/**`, outside `platform/`, `engine/main.ts`,
   `backend/main.ts` and `sessions/ingest.ts` (a non-JSON line is skipped, not thrown): no
   `throw`, `try`/`catch`, `new Promise`, `.then`/`.catch`, `setTimeout`, `setInterval`,
   `Date.now` or `process.env`. Wrap a Promise API once, in the service that owns it.
9. Every resource (engine, process, watcher, socket, timer, fiber) belongs to a Scope; no
   fire-and-forget.
10. Every failure is visible: a tagged error, an error frame or a notice. Silence is a bug.
11. Time comes from `Clock`. Tests use `TestClock` and stay within budget.
12. Never edit generated files: `src/app/routeTree.gen.ts`, `src/app/styles/tokens.gen.css` (from `DESIGN.md`).
13. The repository wins over memory and chat; if they disagree, fix the other. History is git.

## Commands

From the repository root: `bun run dev` (sandboxed agent home) / `dev:host` (real `~/.pi`) /
`sandbox:clean`; `check` (format, docs, lint, type-check, dead code, tests); `build` / `start`;
`test` / `test:tools` / `test:e2e` / `bench`; `lint` / `lint:fix`; `dead-code` / `format`;
`routes:generate`; `doc-check`; `shoot <route…>` (iris screenshots); `parity <main> <port…>` (what a ported file lacks of `main`);
`hooks:install` (once per clone).

## Before you edit

| You are about to                      | Read first                                   |
| ------------------------------------- | -------------------------------------------- |
| touch anything pi                     | `docs/pi/README.md`                          |
| write server or engine code           | `docs/rules/server.md`                       |
| write client code                     | `DESIGN.md`, `docs/rules/client.md`          |
| show an error, empty or loading state | `docs/rules/feedback.md`                     |
| propose a choice that sounds obvious  | `docs/decisions/README.md` (may be rejected) |
| choose what to work on                | `docs/tasks/README.md`                       |
| run a check, or need a budget         | `docs/rules/testing.md`                      |

## How to work

- One task at a time, from `docs/tasks/`; something else you notice becomes a new task.
- Done needs the evidence the task names, at the change's risk.
- Same commit: code, tests, docs and the task's deletion. Message: `type(scope): what`.
- Never `oxlint-disable`, `@ts-expect-error`, `as unknown as` or `.skip` to get green.
- Never drop a feature of `main`'s. Restyle only toward `DESIGN.md`; any other visible change needs the owner's yes.
- Report commands, results, durations, and what you skipped.
- Rule levels: Invariant (lint, no disable); Role (lint checks a role token is used);
  Default (written down; a deviation carries `// ui: <reason>`).
- Folder rules load when you open a file in that folder.

## Stop and ask

- Something of `main`'s seems wrong, unused or not worth keeping.
- The request needs a capability `docs/pi/README.md` does not list.
- The engine would stop being an SDK call inside a process Epsilon supervises.
- A check fails for a reason you do not understand.
- A rule seems to block a feature: propose a role or a `// ui:` deviation; do not work around it.
