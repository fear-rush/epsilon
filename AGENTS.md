# epsilon

A web dashboard for one user. It embeds the `pi` coding agent SDK in its own process
and Epsilon owns the agent home (config, credentials, extensions, packages,
sessions). The dashboard and a terminal using the same agent home are one agent, and
Settings configures it there.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first, [docs/pi-sdk.md](docs/pi-sdk.md)
before touching anything pi, and [docs/DECISIONS.md](docs/DECISIONS.md) for why. Code wins over
prose; fix a doc that disagrees in the same commit, and never copy code or file lists into a doc.

## Workspaces

- `server/`: Hono API, embedded agent engine, disk reads. `features/<name>/` plus `platform/`.
- `client/`: React, Vite, Tailwind, shadcn. `features/` mirrors the server names.
- `shared/`: socket protocol, conversation reducer, rules both sides run.
- `tools/`: local Oxlint plugins. `scripts/`: the dev launcher.

## Commands (from the repository root)

| Command                                          | Result                                          |
| ------------------------------------------------ | ----------------------------------------------- |
| `bun run dev`                                    | Client and server on a sandboxed home           |
| `bun run dev:host`                               | The same, against the real `~/.pi`              |
| `bun run sandbox:clean`                          | Remove the dev sandbox                          |
| `bun run build` / `test` / `lint` / `type-check` | Build, test, Oxlint, TypeScript                 |
| `bun run dead-code` / `format`                   | Knip / Oxfmt                                    |
| `bun run routes:generate`                        | Regenerate the client route tree                |
| `bun run api:generate`                           | Regenerate the client from the server's OpenAPI |
| `bun run hooks:install`                          | Install the commit hooks, once per clone        |

## Invariants

1. Import `@earendil-works/*` only in `server/src/platform/pi.ts` and
   `server/src/features/conversation/`; `shared/src/pi.ts` for types only.
2. `shared/` imports no `node:*` and no React. The reducer stays pure.
3. Do not invent a pi capability. If [pi-sdk.md](docs/pi-sdk.md) does not list it,
   pi does not expose it.
4. Never hand-write `auth.json` or `trust.json`; credentials change only through
   `ModelRuntime.login()`/`logout()`. A key typed in Settings goes to the `apiKey`
   field of `models.json` and never goes back to the browser. Other files: use an
   exported writer, else merge the documented shape, keep unknown keys, refuse to
   write what you cannot parse. OAuth login, MCP sign-in and trust stay in the terminal.
5. The agent home is chosen once, in `server/src/main.ts`, and passed down. An
   inherited `PI_*` variable never decides it. `bun run dev` uses `.sandbox/agent`;
   a check that starts a server sets `EPSILON_AGENT_HOME` to a scratch directory.
   Only `dev:host` touches the real `~/.pi`.
6. Never edit generated files: `client/src/routeTree.gen.ts`, `client/src/api/*.gen.ts`.
7. One schema language (zod), one styling system (Tailwind with shadcn). Add shadcn
   components with `bunx --bun shadcn@latest add <name>`, never `npx`. Forms are
   `FieldGroup` -> `Field` -> `FieldLabel` + control + `FieldDescription`.
8. No state that lives only in server memory or only in the browser. An unsupported
   or unknown state shows a visible notice; silence is never acceptable.

## Add a feature

1. If both sides run a rule, put it in `shared/src/<feature>/rules.ts`.
2. Server `features/<name>/`: `contract.ts` (zod), `store.ts`, `service.ts`,
   `routes.ts`, plus `domain.ts` if there is pure logic. Add one `app.route` line in
   `app.ts`.
3. `bun run api:generate`.
4. Client `features/settings/<name>/`, an entry in `sections.ts`, and thin route
   files in `client/src/routes`.

## Ask before acting when

- The request needs a capability [pi-sdk.md](docs/pi-sdk.md) does not list.
- The engine would stop being an in-process SDK call (no child process, no RPC).
- A check fails for a reason you do not understand.

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
