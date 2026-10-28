# Deploy

Status: **design.** The container, the compose file and the server changes this
document assumes are not written yet. Slices are in [plan.md](plan.md); the reasons
are in [adr/](adr/README.md).

One deployment, one user, one agent home, one project. That scope is what the
socket and the access rules are built for ([protocol.md](protocol.md), Non-goals).

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
([ADR-0005](adr/0005-deployment-owns-agent-home.md)).

## Requirements

- Docker with Compose.
- A project directory on the host to bind mount, or the container's own workspace.
- A provider credential, either stored in the home from a `pi` session or supplied
  through the provider's environment variable.

`pi` does not have to be installed on the host. The image pins one version from
`bun.lock`: the server embeds that package as its engine, and the same version
provides the `pi` CLI for the terminal tab and setup
([ADR-0008](adr/0008-embed-pi-engine-with-opinions.md)).

## Image

| Part                                                                                 | Why                                                                                          |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Node 22.19 or newer (`node:24-bookworm-slim` matches pi's own recipe)                | the agent's runtime                                                                          |
| Bun                                                                                  | the server                                                                                   |
| `bash`, `git`, `ripgrep`, `ca-certificates`                                          | the tools the agent and its extensions expect                                                |
| pinned `@earendil-works/pi-coding-agent`, installed globally with `--ignore-scripts` | so a shell in the container has `pi`, and so extensions that resolve `pi` by name still work |
| glibc, not musl                                                                      | native packages ship both, but the glibc build is the tested one                             |

Do not install `pi` with `npm i -g latest`. The version is pinned with epsilon; a
different one in the container would not match what the server drives.

## Run it

| Setting    | Value                                | Note                                                         |
| ---------- | ------------------------------------ | ------------------------------------------------------------ |
| volume     | `pi-agent-home:/root/.pi/agent`      | credentials, settings, packages, sessions                    |
| volume     | `epsilon-state:/root/.epsilon`       | `ui-state.json` only                                         |
| bind mount | `$PROJECT:/workspace`                | the code the agent works on                                  |
| env        | `EPSILON_PROJECT=/workspace`         | which project the session list is scoped to                  |
| env        | `EPSILON_AGENT_HOME=/root/.pi/agent` | the home the server passes to every engine; the volume above |
| env        | `HOST=0.0.0.0`                       | inside the container; publishing decides who can reach it    |
| ports      | `127.0.0.1:3000:3000`                | loopback publish, then a tunnel                              |

Publishing the port on `0.0.0.0` puts the whole API on the network. There is no
application authentication, by design: access control is loopback plus the tunnel
in front ([features.md](features.md), Access and operations). Bind the publish to
`127.0.0.1`.

## First run

Enter the deployment and use `pi` itself. The image installs the pinned CLI for
this reason:

```
docker compose run --rm -it epsilon pi
```

`/login`, `/settings`, `/trust`, `pi config`, `pi mcp login` and `pi install` all
work there, because it is the real TUI on the real agent home. The dashboard never
writes pi's configuration
([ADR-0006](adr/0006-setup-in-the-deployment-terminal.md)).

A provider key in the environment is the alternative when nothing else can be
configured: pi reads `ANTHROPIC_API_KEY` and its peers directly, with no stored
credential. The key then lives in the deployment's environment, which is a
different trade-off, not a better one.

Either way the dashboard reads the home and, if it is not configured, says so on
the page and names the step. It does not offer a sign-in form.

Packages must be installed inside the deployment, because native dependencies are
bound to the platform ([notes](notes/2026-10-28-packages-are-bound-to-a-platform.md)).

## Development

The dev loop runs in the same container with the repository bind mounted, so the
host agent home is never touched:

- server: `bun --watch run src/serve.ts`
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
   turns die with the container, which [ADR-0008](adr/0008-embed-pi-engine-with-opinions.md)
   accepts as the cost of running the engine in-process.
3. After a pi upgrade, re-run the greps in
   [reference/pi-rpc.md](reference/pi-rpc.md) before trusting the surface again.

`docker compose down -v` deletes the volume, and with it the credentials and every
session. That is the reset button, not the update button.

## Sharing the host's home

Opt-in, and it costs what [ADR-0005](adr/0005-deployment-owns-agent-home.md) says it
costs: the dashboard adopts the host's credentials, policy, extensions, trust
decisions and sessions, and the isolation is gone. Install the home's packages
inside the container first, so the platform matches.

## Troubleshooting

| Symptom                                                | Cause                                                                                                 | Check                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Session runs but project extensions and MCP are absent | project not trusted, and no engine event asks ([note](notes/2026-10-28-rpc-cannot-answer-trust.md))   | run `pi` in the container and answer `/trust`           |
| A package's tools fail though `pi list` shows it       | package installed for another platform ([note](notes/2026-10-28-packages-are-bound-to-a-platform.md)) | reinstall inside the container                          |
| The page says the agent is not configured              | the volume has no credential or no default model                                                      | `docker compose run --rm -it epsilon pi`, then `/login` |
| Page loads, socket closes immediately                  | protocol version mismatch after an upgrade                                                            | reload the tab; the notice names it                     |
| `EACCES` on a bind mount                               | container user does not match the host file owner                                                     | run with the host uid                                   |
