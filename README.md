# Epsilon

A web dashboard for the `pi` coding agent on your machine.

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
