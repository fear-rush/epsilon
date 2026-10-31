# Epsilon

A web dashboard for the `pi` coding agent on your machine.

## Run it

Needs Bun 1.4.4 or newer. `pi` need not be installed.

```bash
bun install
bun run dev
```

The client is on `http://localhost:5173` and proxies `/api` to the server on port 3000.
`bun run dev` runs on a sandbox (below); `bun run dev:host` uses your real `~/.pi`. The API
reference is at `/scalar`.

## Sandbox

`bun run dev` behaves like a fresh machine. Nothing is read from or written to your real
`~/.pi`, `~/.agents`, `~/.claude` or `~/.codex`.

| Path                            | What it is                                                      |
| ------------------------------- | --------------------------------------------------------------- |
| `/Users/Shared/epsilon-sandbox` | The sandbox (`/var/tmp/epsilon-sandbox` off macOS)              |
| `.sandbox`                      | A link to it from the repository, for browsing                  |
| `.sandbox/agent`                | pi's agent home: settings, skills, MCP, packages, sessions      |
| `.sandbox/home`                 | The sandbox's `~`, the `HOME` the server, pi and installers see |

- It lives outside the repository and outside your home on purpose. pi loads every
  `AGENTS.md`/`CLAUDE.md` above a chat's folder up to `/`, and every `.agents/skills` up to the
  git root, so a sandbox under either would load theirs.
- Only `auth.json` and `models.json` are copied in from `~/.pi/agent`, once, so a turn can run.
  Delete them in `.sandbox/agent` to test the unconfigured state.
- Projects must live inside `.sandbox/home` (for example `.sandbox/home/Developer/demo`). The
  folder picker starts there and cannot leave it, and the server refuses any folder outside it:
  pi reads every `AGENTS.md` and `.agents/skills` above a project, so a project on your real disk
  would bring your configuration in. Use `bun run dev:host` to work on real folders.
- `~/.agents/skills` is global and editable in Settings → Skills: the sandbox's own under
  `bun run dev`, your real one under `bun run dev:host`. Other agents read that folder too.
- To clear history, use the sidebar: a chat's menu has **Delete chat**, and a project's menu has
  **Remove from Epsilon**, which deletes that project's chats and leaves the folder and its trust
  alone.
- `bun run sandbox:clean` deletes the whole sandbox; the next `bun run dev` starts a new one.

## Checks

```bash
bun run build && bun run type-check && bun run lint && bun run format:check && bun run dead-code && bun run test
```

## Docs

- [AGENTS.md](AGENTS.md): workspaces, commands, rules, how to add a feature
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the map
- [docs/pi-sdk.md](docs/pi-sdk.md): what pi exposes, and its traps
- [docs/DECISIONS.md](docs/DECISIONS.md): decisions and the options rejected
