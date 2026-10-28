# ADR-0005: The deployment owns the agent home

- Status: Accepted
- Date: 2026-10-28

## Context

A child inherits the environment of the server that spawned it, and nothing in
`server/src/config.ts` names a config directory. So the agent home is whatever
`~/.pi/agent` resolves to for the user who started the server, or whatever
`PI_CODING_AGENT_DIR` happened to be exported in that shell. Today epsilon cannot
say which home it uses, and cannot choose one.

[ADR-0001](0001-engine-rpc-child.md) assumed a configured `pi` on the machine.
That assumption is wrong for the actual deployment target. epsilon is meant to run
on another machine and be reached from a phone, where the operator has no terminal
and may never have installed `pi`.

pi's home is not just settings. It holds provider credentials, the default model,
provider definitions, installed extensions and packages, MCP servers, project trust
decisions and the session files. Sharing the host's home therefore means sharing
all of that, including a permission policy the operator wrote for their own
terminal.

## Decision

1. One agent home per deployment, at pi's own default path inside that
   deployment: `$HOME/.pi/agent`. It is resolved once, in `config.ts`.
2. The default deployment is a container, and the home is a named volume. It
   survives image rebuilds and is not the launching user's home. See
   [../deploy.md](../deploy.md).
3. Children receive the home explicitly, from the server, never by inheritance.
   The inherited `PI_CODING_AGENT_DIR`, `PI_CODING_AGENT_SESSION_DIR` and
   `PI_PACKAGE_DIR` must not decide it. An override exists for tests and for a
   deliberately shared home.
4. The host's `~/.pi/agent` is not mounted by default. Sharing is opt-in, per
   deployment, and documented with its cost.
5. Sessions stay grouped by project (`cwd`), not by home, so "this project's
   sessions" keeps its meaning across a shared and an isolated deployment.

Nothing is persisted to record the choice. The home is deterministic, so a file
naming it would be a second source of truth that can disagree with the
environment. `~/.epsilon/ui-state.json` remains the only epsilon-owned state.

## Consequences

- A fresh deployment has no credentials, no default model, no extensions and no
  permission policy. pi core does not ask for approval before a tool call, so a
  fresh instance is strictly less guarded than a configured one. This is why
  setup happens in a terminal inside the deployment
  ([ADR-0006](0006-setup-in-the-deployment-terminal.md)) and why an unconfigured
  instance must be visible rather than silent.
- Package installation is per platform: a home built on macOS does not run its
  native packages on Linux. Copying a home between platforms is not supported.
- Terminal sharing within a deployment still works: open a shell in the container
  and the same home is there. Terminal sharing with the host is gone unless the
  operator mounts it.
- The "same sessions as the terminal" promise from ADR-0001 now means "the
  terminal inside this deployment". The record's requirement that the machine
  already has a configured `pi` is superseded.
- A deployment that wants to share a home does so knowingly: credentials, policy
  and sessions become the host's.

## Rejected alternatives

- **Keep inheriting the host home.** The current behaviour. No isolation, no
  deployment on a machine without `pi`, and a dashboard that silently adopts
  whatever policy the launching shell had.
- **An epsilon-owned home at `~/.epsilon/agent`.** Diverges from where pi and
  every pi-based tool expects state, so a `pi` run in the same deployment would
  not see it, and `getAgentDir()` would be a lie.
- **An epsilon config file naming the home.** Adds persistence to track a value
  that is already deterministic, and creates a file that can disagree with both
  the environment and pi.
- **Mount the host home read-only.** pi writes sessions, credentials, trust and
  package state. A read-only mount fails at the first turn.

## Revisit if

- pi gains a multi-home or profile concept that epsilon should expose.
- A deployment needs two homes at once, such as a personal one and a project one.
