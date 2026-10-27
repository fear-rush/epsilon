# epsilon

Single-user web dashboard for the `pi` coding agent. It drives the `pi` CLI as a
child process in `--mode rpc`, so it shares sessions, extensions, tools and
credentials with the terminal `pi`. Start with [plan.md](docs/plan.md), then
[architecture.md](docs/architecture.md).

## Workspaces

- `server/`: Hono API, agent children, disk reads. Node-compatible.
- `client/`: React, Vite, Tailwind, shadcn.
- `shared/`: browser-safe types, zod schemas, the conversation reducer.
- `tools/`: local Oxlint plugins.

## Commands

`bun run dev` · `build` · `test` · `lint` · `format` · `type-check` ·
`routes:generate` · `hooks:install` (once per clone).

## Docs

| Read                                            | For                                                   |
| ----------------------------------------------- | ----------------------------------------------------- |
| [plan.md](docs/plan.md)                         | What to build next. Keep its "Current state" honest.  |
| [architecture.md](docs/architecture.md)         | Modules, data flows, state ownership, failure modes.  |
| [protocol.md](docs/protocol.md)                 | The browser socket contract.                          |
| [ui.md](docs/ui.md)                             | Component choice, layout, visual states, interaction. |
| [features.md](docs/features.md)                 | Every feature and how it is built.                    |
| [reference/pi-rpc.md](docs/reference/pi-rpc.md) | What pi's RPC exposes and what it does not.           |
| [adr/](docs/adr/README.md)                      | Why the engine and the UI contract are what they are. |

## Rules

1. `@earendil-works/*` only in `server/src/agent/` (runtime) and `shared/src/pi.ts`
   (types). Everywhere else, use what those modules export.
2. `shared/` imports no `node:*` and no React. `client/src/conversation/` imports
   no React: the reducer stays pure and replay-testable.
3. No invented capability. If [pi-rpc.md](docs/reference/pi-rpc.md) does not list
   it, pi does not expose it: no `/reload`, no in-session branch switching, no
   login or trust forms.
4. One schema language (`zod`), one styling system (Tailwind + shadcn variants).
5. Files under 300 lines. Route handlers under 60: validate, call one function,
   return.
6. No state that lives only in server memory or only in the browser.
7. Unsupported or unknown UI shows a visible notice, never silence.

## Truth and drift

Docs record intent. Code records reality. When they disagree, **code wins**, and the
doc is corrected in the same commit.

- Verify by reading the file, running the command or grepping pi's `dist`. Never
  answer from memory, and never from these docs alone.
- [reference/pi-rpc.md](docs/reference/pi-rpc.md) goes stale when pi changes. Re-run
  the greps in its header before trusting it.
- Do not restate code in docs: no file inventories, no copied types, no route
  lists. Name the file or the command instead.
- Facts that can be generated are generated (OpenAPI, types). Never keep a second
  hand-maintained copy.
- An accepted ADR is history. Supersede it with a new record; never edit it.
- Delete rather than comment out. Scaffolding from a finished slice is removed.
- A file too large to read in one pass is a defect. Split it before adding to it.

## Stop and ask

Ask before acting when any of these is true:

- Two docs disagree, or a doc disagrees with the code.
- The request names a capability that
  [reference/pi-rpc.md](docs/reference/pi-rpc.md) does not list.
- The change would break one of the rules above (import boundary, size cap, one
  schema language, one styling system).
- A check fails for a reason you do not understand, or a result looks unusual.
- More than one reading of the requirement would produce different code.

State what is inconsistent, what you checked, and the options. Do not guess, do not
rewrite the doc to match a bug, and do not proceed silently.

## Integrations

- REST state through TanStack Query. Socket state never enters Query.
- File routes in `client/src/routes`. Never edit `routeTree.gen.ts`.
- API routes use `createRoute`; the OpenAPI document is generated, never
  hand-written.
- shadcn: `bunx --bun shadcn@latest add <name>`, never `npx`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
