# Epsilon

Epsilon is a self-hosted web workspace for the `pi` coding agent. It runs the agent
in its own deployment, keeps that agent's home (config, credentials, skills,
packages and sessions) in the deployment, and puts the whole thing in a browser, so
a run started at a desk can be continued, steered or answered from anywhere.

There is one agent, not two: the dashboard and a `pi` terminal inside the same
deployment read the same home, so they share sessions, providers and permissions.
Epsilon is built for one operator. It has no accounts, no multi-user model and no
tenancy, by design: you put it behind a private network or a tunnel and it is yours.

## What it does

- **Continue.** A session list, a live transcript, and a composer that sends,
  steers mid-run and aborts, with the model and permission controls beside it.
- **Read the run.** Streaming text, thinking, tool calls with their arguments and
  output, bash output, image results and errors, rendered as a conversation instead
  of a terminal scrollback.
- **Answer.** Permission approvals and extension questions arrive as dialogs and
  hold the run until you answer, from whichever device is in front of you.
- **Configure.** Providers and their models, the default model, MCP servers, skills
  and packages are edited in Settings and written to the agent home, so a machine
  that has never had `pi` configured becomes usable from the browser.
- **Notice what is missing.** A home with no usable model replaces every page with
  one notice that says what to do and links to Settings, never a silently failed
  turn.

## Requirements

- Bun 1.4.4 or newer.
- A project directory for the agent to work in.
- `pi` does not have to be installed. The version Epsilon drives is pinned in
  `server/package.json` and installed with the rest of the dependency tree.

## Run it

```bash
bun install
bun run dev
```

The client listens on `http://localhost:5173` and proxies `/api` to the server on
`http://localhost:3000`.

`bun run dev` keeps the agent's home inside the repository, at `.sandbox/agent`, so a
turn never writes into your own `~/.pi`. It copies `auth.json` and `models.json` into
the sandbox, so the loop can run a turn and Settings writes the copies. Delete both,
or run `bun run sandbox:clean`, to see the unconfigured state. `bun run dev:host`
runs the same loop against the real `~/.pi` when you want to read sessions your
terminal created.

## Configure

Configuration lives in the agent home, not in Epsilon's own files. Settings writes
providers and their models to `models.json`, the default model through pi's settings
manager, MCP servers to `mcp.json`, skills as `<home>/skills/<name>/SKILL.md`, and
packages through pi's package manager. A write reloads live sessions.

Two things stay in a terminal inside the deployment, because pi only exposes them
there: OAuth login and project trust. An API key typed in Settings goes to the
documented `apiKey` field of `models.json` and is never sent back to the browser.

## Deploy

Epsilon is built for one deployment per person: one service, a volume for the agent
home, a bind mount for the project, and one port published on loopback. Reach it
through Tailscale or an SSH tunnel. The app has no authentication, so the network is
the boundary. Running it where a terminal's `pi` never was is the point, because a
fresh home is configured from Settings.

## Checks

```bash
bun run build
bun run type-check
bun run lint
bun run format:check
bun run dead-code
bun run test
```

## Workspaces

- `client/`: React, Vite, Tailwind and shadcn components.
- `server/`: Hono API and the embedded pi engine.
- `shared/`: browser-safe types, zod schemas and the conversation reducer.
- `tools/`: local Oxlint plugins.

## Tooling notes

`bun run lint` checks every workspace with Oxlint and `bun run format` formats with
Oxfmt. `bun run type-check` fails on unused locals, parameters and private members,
and `bun run dead-code` fails on an unused file, export or dependency.

`.oxlintrc.json` enables the React Hooks and React Refresh rules and the anti-slop
rules in `tools/oxlint/anti-slop`. `client/src/components/ui` holds the components
`shadcn add` writes, with two anti-slop rules off for that folder because registry
code trips them and an add would overwrite a local rewrite.

`bunfig.toml` requires a newly resolved package version to be at least three days
old. Versions in `bun.lock` do not change.

## API reference

Scalar serves the API reference at `/scalar`, and the OpenAPI document is at
`/openapi.json`. The document is generated from `createRoute` schemas.
