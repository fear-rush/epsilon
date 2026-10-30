# Deploy

Status: **design.** No Dockerfile or compose file exists yet; this page records
what they must do. The reasons are in [DECISIONS.md](DECISIONS.md).

One deployment, one user, one agent home, one project. That scope is what the
socket and the access rules are built for.

## Shape

```
  phone or laptop ──tunnel──▶ host loopback ──▶ container
                                                 ├── epsilon server + client
                                                 ├── embedded pi engine
                                                 └── agent home (named volume)
                       bind mount: the project the agent works on
```

The agent home is a named volume at pi's default path inside the container. It is
not the operator's host home, which is the point
([DECISIONS.md](DECISIONS.md), Agent home).

## Requirements

- Docker with Compose.
- A project directory on the host to bind mount, or the container's own workspace.
- A provider credential, either stored in the home from a `pi` session or supplied
  through the provider's environment variable.

`pi` does not have to be installed on the host. The image pins one version from
`bun.lock`: the server embeds that package as its engine, and the same version
provides the `pi` CLI for the terminal and setup
([DECISIONS.md](DECISIONS.md), Embedded engine).

## Image

| Part                                                                                        | Why                                                                                          |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Node 22.22 or newer (`node:24-bookworm-slim` matches pi's own recipe; pi itself asks 22.19) | the CLI's runtime; the embedded engine uses the server's Bun                                 |
| Bun                                                                                         | the server                                                                                   |
| `bash`, `git`, `ripgrep`, `ca-certificates`                                                 | the tools the agent and its extensions expect                                                |
| pinned `@earendil-works/pi-coding-agent`, installed globally with `--ignore-scripts`        | so a shell in the container has `pi`, and so extensions that resolve `pi` by name still work |
| glibc, not musl                                                                             | native packages ship both, but the glibc build is the tested one                             |

Do not install `pi` with `npm i -g latest`. The version is pinned with epsilon; a
different one in the container would not match what the server drives.

## Run it

| Setting    | Value                                | Note                                                                         |
| ---------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| volume     | `pi-agent-home:/root/.pi/agent`      | credentials, settings, packages, sessions                                    |
| bind mount | `$PROJECT:/workspace`                | the code the agent works on                                                  |
| env        | `EPSILON_PROJECT=/workspace`         | which project the session list is scoped to                                  |
| env        | `EPSILON_AGENT_HOME=/root/.pi/agent` | the home the server passes to every engine; the volume above                 |
| env        | `HOST=0.0.0.0`                       | **planned**: the server binds `127.0.0.1` today; a published port needs this |
| ports      | `127.0.0.1:3000:3000`                | loopback publish, then a tunnel                                              |

Publishing the port on `0.0.0.0` puts the whole API on the network. There is no
application authentication, by design: access control is loopback plus the tunnel
in front. Bind the publish to
`127.0.0.1`.

## First run

Open the dashboard, choose **Settings** at the bottom of the sidebar, and add a
provider: its base URL, API family, key and models. That writes the documented
`models.json` entry in the deployment's agent home
([DECISIONS.md](DECISIONS.md), Configure in the dashboard). The same panel adds MCP
servers, skills and packages.

The image also installs the pinned CLI, for what a host cannot do:

```
docker compose run --rm -it epsilon pi
```

`/login` for an OAuth or subscription account and `/mcp login` for remote servers
that need a browser both work there, because it is the real TUI on the real agent
home. The dashboard itself always trusts the folder it runs in, so `/trust` only
changes the terminal's own sessions. `/settings` remains the place for pi settings
the panel does not cover.

A provider key in the environment is the alternative when nothing else can be
configured: pi reads `ANTHROPIC_API_KEY` and its peers directly, with no stored
credential. The key then lives in the deployment's environment, which is a
different trade-off, not a better one.

A home with no usable model shows one notice on every page, naming the home and
opening Settings.

Packages must be installed inside the deployment, because native dependencies are
bound to the platform ([pi-sdk.md](pi-sdk.md), Traps).

## Development

`bun run dev` is sandboxed on purpose. It points the engine at
`.sandbox/agent` and the project at `.sandbox/project`, so a turn never writes a
session, a cache or a credential into the operator's real `~/.pi`. It copies the
host's `auth.json` and `models.json` into the sandbox, so a dev turn can run and
Settings writes the copy rather than the operator's file. Both are copies, not links,
because deleting a provider logs it out and that writes `auth.json`. That is why a
fresh sandbox may look configured: remove both, or run `bun run sandbox:clean`, to
see the unconfigured state. The sandbox materializes itself: pi creates `sessions/`,
`auth.json` and `models-store.json` on first use.

`bun run dev:host` runs the same loop against the real home, for reading sessions the
terminal created. `bun run sandbox:clean` removes the sandbox.

The two `EPSILON_*` values are set, and two inherited pi variables
(`PI_PACKAGE_DIR`, `PI_CODING_AGENT_SESSION_DIR`) are cleared so the sandbox decides
its own paths. `HOME` does not change, so pi still reads `~/.agents/skills` while
developing; that is a read, not clutter.

Inside the container the loop is the same with the repository bind mounted:

- server: `bun --watch run src/main.ts`
- client: Vite with HMR, proxying `/api` to the server
- polling is required for file watching across a Docker Desktop bind mount on
  macOS, or edits do not reach the watcher

Keep the repository and the agent's project separate. If the same directory is
both, the agent has write access to epsilon's own source, and a slice's diff can
contain the fix for its own bug in a way nobody reviewed.

## What the container isolates

Inside the boundary: the pi process, its tools, `!` commands, extensions, MCP
servers, and anything they spawn. That is pi's own recommendation for whole-process
isolation.

Not inside: the bind-mounted project (the agent writes your files), the network
(the agent can reach anything the container can), credentials once they are in the
home, and the host kernel.

A container is not a sandbox for the code the agent writes. It is a boundary for
what a wrong command can reach.

## Updating

1. Rebuild the image. Dependencies and the pinned pi version come from the lockfile.
2. Restart. The volume keeps settings, credentials, packages and sessions; running
   turns die with the container, which [DECISIONS.md](DECISIONS.md), Embedded engine,
   accepts as the cost of running the engine in-process.
3. After a pi upgrade, re-run the greps in
   [pi-sdk.md](pi-sdk.md) before trusting the surface again.

`docker compose down -v` deletes the volume, and with it the credentials and every
session. That is the reset button, not the update button.

## Sharing the host's home

Opt-in, and it costs what [DECISIONS.md](DECISIONS.md), Agent home, says it
costs: the dashboard adopts the host's credentials, policy, extensions and
sessions, and the isolation is gone. Install the home's packages
inside the container first, so the platform matches.

## Troubleshooting

| Symptom                                               | Cause                                                                                                                 | Check                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Session runs but project extensions or MCP are absent | `settings.json` lists a `-builtin:` switch for them, or the deployment's project folder is not the one holding `.pi/` | check the `extensions` list and `EPSILON_PROJECT` |
| A package's tools fail though `pi list` shows it      | package installed for another platform (pi-sdk.md, Traps)                                                             | reinstall inside the container                    |
| The page shows the not-ready notice                   | the volume has no provider with a usable credential                                                                   | open Settings and add a provider                  |
| Page shows a version-mismatch notice with Reload      | the tab was loaded from a different build than the server speaks                                                      | press Reload; the page names the mismatch         |
| `EACCES` on a bind mount                              | container user does not match the host file owner                                                                     | run with the host uid                             |
