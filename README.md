# Epsilon

A web dashboard for the `pi` coding agent on your machine.

> The rebuild's two halves are in place: the server and the page. The page runs on one
> socket: a session sidebar, a virtualized transcript, the composer, extension dialogs, the
> `discuss` tool, and the settings sections for General, Providers, MCP, Context, Skills,
> Packages and Diagnostics (see `AGENTS.md` and `docs/ARCHITECTURE.md`).

## Run it

Needs Bun 1.4.4 or newer. `pi` need not be installed.

```bash
bun install
bun run dev     # sandboxed agent home
bun run dev:host # your real ~/.pi
```

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
  `AGENTS.md`/`CLAUDE.md` above a chat's folder up to `/`, and every `.agents/skills` up to
  the git root, so a sandbox under either would load theirs.
- Only `auth.json` and `models.json` are copied in from `~/.pi/agent`, once, so a turn can run.
  Delete them in `.sandbox/agent` to test the unconfigured state.
- Projects must live inside `.sandbox/home`. The server refuses any folder outside it, since
  pi reads every `AGENTS.md` and `.agents/skills` above a project.
- `bun run sandbox:clean` deletes the whole sandbox; the next `bun run dev` starts a new one.

## Checks

```bash
bun run check   # format, lint, type-check, dead code, tests
```

## Docs

- [AGENTS.md](AGENTS.md): layout, commands, invariants, working rules
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): processes, roots, flows
- [docs/effect.md](docs/effect.md): the Effect style the server and engine follow
- [docs/pi-sdk.md](docs/pi-sdk.md): what pi exposes, and its traps
- [docs/DECISIONS.md](docs/DECISIONS.md): decisions and the options rejected
