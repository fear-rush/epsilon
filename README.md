# Epsilon

A self-hosted web workspace for the `pi` coding agent. It runs the agent in its own
deployment, keeps the agent's home (config, credentials, skills, packages, sessions)
there, and puts it in a browser: continue sessions, read runs, answer permission
prompts, and configure providers, MCP servers, skills and packages in Settings. Built
for one operator behind a private network or tunnel; there are no accounts.

## Run it

Needs Bun 1.4.4 or newer. `pi` need not be installed.

```bash
bun install
bun run dev
```

The client is on `http://localhost:5173` and proxies `/api` to the server on port 3000. `bun run dev` keeps the agent home in `.sandbox/agent`, so nothing touches your
`~/.pi`; `bun run dev:host` uses the real one. The API reference is at `/scalar`.

## Checks

```bash
bun run build && bun run type-check && bun run lint && bun run format:check && bun run dead-code && bun run test
```

## Docs

- [AGENTS.md](AGENTS.md): workspaces, commands, rules, how to add a feature
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the map
- [docs/DEPLOY.md](docs/DEPLOY.md): running it in a container
- [docs/pi-sdk.md](docs/pi-sdk.md): what pi exposes, and its traps
- [docs/adr/](docs/adr/README.md): decisions
