# epsilon

A web dashboard for one user. It controls the `pi` coding agent and starts it as
a child process in `--mode rpc`. The dashboard shares sessions, extensions, tools
and credentials with the terminal `pi`.

Status: design, not implemented. Start with [docs/README.md](docs/README.md), then
[docs/plan.md](docs/plan.md).

## Requirements

- Bun 1.4.2 or newer.
- Node.js 22.22 or newer.
- `pi` installed and configured on the same machine.

## Development

```bash
bun install
bun run dev
```

`bun run dev:client` starts the frontend. `bun run dev:server` starts the API. The
client listens on `http://localhost:5173`. Vite proxies `/api` to
`http://localhost:3000`.

## Checks

```bash
bun run build
bun run type-check
bun run lint
bun run format:check
bun run test
```

## Workspaces

- `client/`: React, Vite, Tailwind and shadcn components.
- `server/`: Hono API and, later, the agent children.
- `shared/`: browser-safe types, zod schemas and the conversation reducer.
- `tools/`: local Oxlint plugins.

## Oxlint and Oxfmt

- `bun run lint` checks all workspaces with Oxlint.
- `bun run lint:fix` applies the available lint fixes.
- `bun run format` formats files with Oxfmt.
- `bun run format:check` checks formatting without a change.
- `bun run type-check` checks TypeScript separately.

`.oxlintrc.json` enables React Hooks and React Refresh rules. It also enables 15
anti-slop rules at error severity. The plugin lives in `tools/oxlint/anti-slop`.
The configuration ignores build output, the generated route tree, migration
output and agent tooling directories. Formatting options live in `.oxfmtrc.json`.

`client/src/components/ui` holds components that `shadcn add` writes. An override
turns off two anti-slop rules for that folder, because registry code trips them
and `shadcn add` would overwrite a local rewrite. Run
`bunx --bun shadcn@latest add <component>` from `client/` to add a component.

## Commit checks with prek

`@j178/prek` is a root development dependency, equivalent to
`bun add -D @j178/prek`. The project generator installs the Git hook. For an
existing clone, run:

```sh
bun install
git init # only when the repository has no Git directory
bun run hooks:install
```

The hook formats staged files, lints staged code, checks workspace types and
scans staged changes with Gitleaks. It detects private keys and blocks `.env`
files, except `.env.example`. It checks merge conflicts, file size, case
conflicts, symlinks, JSON/JSONC, YAML, TOML, whitespace, final newlines and line
endings. Formatting uses the Oxc configuration. Restage the files that the
formatter changes, then commit again.

```sh
bun run hooks:run    # check all tracked files
bun run hooks:update # update pinned remote hook revisions
```

Gitleaks output is redacted. The first run downloads and builds the pinned hook
with prek's managed Go toolchain. Hook environments live in the prek cache, not in
project dependencies. `.pre-commit-config.yaml` controls the checks. The hooks
need Bun and the installed project dependencies. Git hooks are local, so install
them in each clone.

## Package resolution

`bunfig.toml` requires a newly resolved package version to be at least three days
old. Versions in `bun.lock` do not change.

## API reference

Scalar serves the API reference at `/scalar`. The OpenAPI document is at
`/openapi.json`. The document is generated from `createRoute` schemas. Until the
REST surface lands, `server/src/openapi.ts` holds the current document, which
describes `/health` only.
