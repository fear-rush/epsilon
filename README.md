# epsilon

A TypeScript workspace with a streaming chat UI, a Hono API, and a shared package. The UI is ported from [shadcn-ui/chatbot-template](https://github.com/shadcn-ui/chatbot-template) onto Vite, React, and TanStack Router.

## Requirements

- Bun 1.4.2 or newer
- Node.js 22.22 or newer for the CLI and build tools
- Docker with Compose when using local PostgreSQL containers

Complete the configuration for any selected addons below before starting development.

## Development

```bash
bun install
bun run dev
```

`bun run dev:client` starts the frontend. `bun run dev:server` starts the API. The default development URLs are `http://localhost:5173` and `http://localhost:3000`. Vite proxies `/api` to the server.

## Chat

The chat streams from [CommandCode](https://api.commandcode.ai) through the AI SDK. Add your key before the first message:

```bash
cp server/.env.example server/.env
# then set COMMANDCODE_API_KEY
```

`POST /api/chat` returns `503` until the key is set.

CommandCode serves two wire formats: Claude models only on Anthropic `/messages`, everything else on OpenAI `/chat/completions`. Each entry in `CHAT_MODELS` (`shared/src/chat.ts`) names its format, and `server/src/chat.ts` builds an `@ai-sdk/anthropic` or `@ai-sdk/openai-compatible` model accordingly, both pointed at `https://api.commandcode.ai/provider/v1`. The list mirrors `GET https://api.commandcode.ai/provider/v1/models`; DeepSeek V4.1 Flash is first and therefore the default. Refresh the list when CommandCode adds models.

The model can call two tools, both defined alongside the model list: `github_repo` looks up public repository stats, and `ask_user` asks clarifying questions that the user answers in the UI. Replies, reasoning blocks, tool calls, and markdown render through `client/src/components`.

## Checks

```bash
bun run build
bun run type-check
bun run lint
bun run format:check
bun run test
```

## Workspaces

- `client/`: frontend code and assets
- `server/`: API routes and server dependencies
- `shared/`: shared TypeScript types

Database credentials and auth secrets belong in the server environment. Variables prefixed with `VITE_` are available to frontend code.

`bunfig.toml` requires newly resolved package versions to be at least three days old. Existing versions in `bun.lock` remain unchanged.

## Oxlint and Oxfmt

- `bun run lint` checks all workspaces with Oxlint.
- `bun run lint:fix` applies available lint fixes.
- `bun run format` formats files with Oxfmt.
- `bun run format:check` checks formatting without modifying files.
- `bun run type-check` checks TypeScript separately.

React Hooks and React Refresh rules are enabled. Generated build outputs, route trees, and migration artifacts are excluded. Rules live in `.oxlintrc.json`; formatting options live in `.oxfmtrc.json`.

`client/src/components/ui` holds components vendored by `shadcn add`, so its override turns off the two anti-slop rules that registry code trips; `shadcn add` would overwrite local rewrites. Run `bunx shadcn add <component>` from `client/` to add more.

The 15 generic anti-slop rules are enabled at error severity. Their plugin lives in `tools/oxlint/anti-slop`; `@oxlint/plugins` is pinned to the Oxlint version. Effect rules are not included. Both tools ignore agent tooling directories and the vendored plugin.

## Commit checks with prek

`@j178/prek` is a root development dependency, equivalent to `bun add -D @j178/prek`. The generator installs the Git hook when Git initialization and dependency installation are enabled. For clones or projects generated with either step skipped, run:

```sh
bun install
git init # Only when there is no Git repository yet
bun run hooks:install
```

The hook formats staged files, lints staged code, checks workspace types, scans staged changes with Gitleaks, detects private keys, blocks `.env` files except `.env.example`, and checks merge conflicts, file size, case conflicts, symlinks, JSON/JSONC, YAML, TOML, whitespace, final newlines, and line endings. Formatting uses the Oxc configuration. Restage files changed by a formatter and retry the commit. Tests remain available through `bun run test`.

```sh
bun run hooks:run    # Check all tracked files; Gitleaks checks staged changes
bun run hooks:update # Update pinned remote hook revisions
```

Gitleaks output is redacted. Its first run downloads and builds the pinned hook using prek's managed Go toolchain if needed. Hook environments live in prek's cache, not in project dependencies. `.pre-commit-config.yaml` controls the checks. Hooks require Bun and installed project dependencies; Git hooks are local and must be installed in each clone.

## Scalar

API documentation is available at `/scalar`; the OpenAPI document is served at `/openapi.json`. Edit `server/src/openapi.ts` as you add API routes. Bundled scaffolds document `/health`. Custom repository scaffolds start with an empty specification.
