# Epsilon

A local web workspace for the `pi` coding agent. It runs the agent in its own
process, keeps the agent's home (config, credentials, skills, packages, sessions),
and puts it in a browser: continue sessions, read runs, answer permission
prompts, and configure providers, MCP servers, skills and packages in Settings. Built
for one operator on one machine; there are no accounts.

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
- [docs/pi-sdk.md](docs/pi-sdk.md): what pi exposes, and its traps
- [docs/DECISIONS.md](docs/DECISIONS.md): decisions and the options rejected
