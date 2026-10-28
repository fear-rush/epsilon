# epsilon

A web dashboard for one user. It embeds the `pi` coding agent in its own process
([ADR-0008](docs/adr/0008-embed-pi-engine-with-opinions.md),
[ADR-0009](docs/adr/0009-socket-speaks-epsilon.md)). The deployment it runs in owns
that agent's home: config, credentials, extensions, packages, sessions and trust
([ADR-0005](docs/adr/0005-deployment-owns-agent-home.md)). The dashboard and a
terminal inside the same deployment are therefore one agent, and the dashboard never
configures pi itself ([ADR-0006](docs/adr/0006-setup-in-the-deployment-terminal.md)).

Status: S1 to S13 are done and S14 is active. Progress lives in
[docs/plan.md](docs/plan.md); the per-slice checks are in
[docs/plan/slices.md](docs/plan/slices.md).

Start with [docs/README.md](docs/README.md). Read these documents in this order:

| Document                                        | Use                                                  |
| ----------------------------------------------- | ---------------------------------------------------- |
| [plan.md](docs/plan.md)                         | What to build next. Keep "Active slice" honest.      |
| [architecture.md](docs/architecture.md)         | Modules, data flows, state ownership, failure modes  |
| [protocol.md](docs/protocol.md)                 | The browser socket contract                          |
| [ui.md](docs/ui.md)                             | Component choice, layout, visual states, interaction |
| [features.md](docs/features.md)                 | Every feature, its scope and how to build it         |
| [deploy.md](docs/deploy.md)                     | How it runs where `pi` was never installed           |
| [reference/pi-rpc.md](docs/reference/pi-rpc.md) | What pi exposes: RPC, its library, and its CLI       |
| [adr/](docs/adr/README.md)                      | Why the engine, the home and the UI contract are so  |
| [notes/](docs/notes/README.md)                  | How to record a trap that cost time                  |

## Workspaces

- `server/`: Hono API, the embedded agent engine, disk reads. Node-compatible.
- `client/`: React, Vite, Tailwind, shadcn.
- `shared/`: browser-safe types, zod schemas, the conversation reducer.
- `tools/`: local Oxlint plugins.

## Commands

Run these commands from the repository root:

| Command                   | Result                                                 |
| ------------------------- | ------------------------------------------------------ |
| `bun run dev`             | Start the client and the server, on a sandboxed home   |
| `bun run dev:host`        | The same, against the operator's real `~/.pi`          |
| `bun run sandbox:clean`   | Remove the dev sandbox                                 |
| `bun run build`           | Build every workspace                                  |
| `bun run test`            | Run the tests                                          |
| `bun run lint`            | Run Oxlint on every workspace                          |
| `bun run dead-code`       | Find unused files, exports and dependencies (Knip)     |
| `bun run format`          | Format the files with Oxfmt                            |
| `bun run type-check`      | Check TypeScript                                       |
| `bun run routes:generate` | Generate the route tree                                |
| `bun run hooks:install`   | Install the Git hooks. Run this command once per clone |

## Rules

1. Import `@earendil-works/*` only in `server/src/agent/` for runtime code and
   `shared/src/pi.ts` for types. Everywhere else, use the exports of those modules.
2. `shared/` imports no `node:*` module and no React. `client/src/conversation/`
   imports no React. The reducer stays pure and testable by replay.
3. Do not invent a capability. If [pi-rpc.md](docs/reference/pi-rpc.md) does not
   list it, pi does not expose it. That file records pi's RPC surface, its exported
   library and its CLI, because a feature may be missing from one and present in
   another: login has no RPC command and does have a library call. Examples that
   exist nowhere: no `/reload` over RPC, no in-session branch switch over RPC, no
   command that writes a credential.
4. Use one schema language (`zod`) and one styling system (Tailwind with shadcn
   variants).
5. Keep every file under 300 lines. Keep every route handler under 60 lines. A
   route handler rejects bad input, calls one function and returns.
6. Do not keep state that lives only in server memory or only in the browser.
7. Show a visible notice when the UI is unsupported or unknown. Silence is not an
   acceptable result. A deployment that is not configured is an unsupported state.
8. pi's files are pi's. The dashboard does not write settings, credentials or trust.
   Setup happens in a terminal inside the deployment
   ([ADR-0006](docs/adr/0006-setup-in-the-deployment-terminal.md)); the dashboard
   reports what is missing and says which command fixes it.
9. The agent home is chosen once, in `config.ts`, and passed to every engine
   explicitly. Never let an inherited `PI_*` variable decide which config a
   deployment runs on.

## Truth and drift

Documents record intent. Code records reality. When they disagree, code wins.
Correct the document in the same commit.

- Check a fact by reading the file, running the command or searching pi's `dist`
  folder. Do not answer from memory. Do not answer from these documents alone.
- [reference/pi-rpc.md](docs/reference/pi-rpc.md) becomes stale when pi changes.
  Run the greps in its header before you trust it.
- Do not copy code into a document. Do not list files, types or routes. Name the
  file or the command.
- Generate a fact when a tool can generate it, such as OpenAPI or types. Do not
  keep a second copy by hand.
- An accepted ADR is history. Write a new record to supersede it. Do not edit the
  old record.
- Delete code. Do not comment it out. Delete the scaffolding when you finish a
  slice.
- Split a file that is too large to read in one pass. Split it before you add to it.

## Stop and ask

Ask before you act when one of these is true:

- Two documents disagree.
- A document and the code disagree.
- The request names a capability that [reference/pi-rpc.md](docs/reference/pi-rpc.md)
  does not list, over RPC, in the library or in the CLI.
- The change breaks a rule above: import boundary, size cap, one schema language
  or one styling system.
- A check fails for a reason you do not understand.
- A result looks unusual.
- Two readings of the requirement produce different code.

State what is inconsistent, what you checked and the options. Do not guess. Do not
rewrite a document to match a bug. Do not continue without an answer.

## Integrations

- Read REST state with TanStack Query. Never put socket state in Query.
- Put file routes in `client/src/routes`. Never edit `routeTree.gen.ts`.
- Build API routes with `createRoute`. Generate the OpenAPI document. Never write
  it by hand.
- Add shadcn components with `bunx --bun shadcn@latest add <name>`. Never use `npx`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
