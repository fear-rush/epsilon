# ADR-0001: Drive the pi CLI over `--mode rpc`

- Status: Accepted
- Date: 2026-10-28

## Context

Epsilon is a single-user web dashboard for the `pi` coding agent, replacing the
existing pi-web. It is reached from a phone or a second device on the same
network, while the agent works on one machine.

The requirements that decide the engine:

- **Same sessions as the terminal.** A conversation started with `pi` on the
  laptop must be readable and continuable from the browser.
- **Same extensions, skills, MCP servers and packages.** The machine already has
  a configured `pi` with permission prompts and helper extensions installed.
- **Same tools and providers.** Eight coding tools, the existing credentials and
  `models.json`.
- **Runs keep going when the browser closes.** The agent must outlive the tab.

pi ships two agent runtimes. `@earendil-works/pi-coding-agent` is the CLI product:
its own extension API, its session files under `~/.pi/agent/sessions`, and an RPC
mode that speaks JSON lines on stdin/stdout. `@earendil-works/pi-durable` is a
durable harness library with its own storage, its own task model and
`@earendil-works/chord` for multi-client links.

## Decision

1. Spawn `pi --mode rpc` as a child process per live session. One child per
   session, capped at 3 to 5, evicted LRU and killed when idle. The child is a
   cache; the session file on disk is the truth.
2. Sessions are pi's JSONL files. Epsilon does not copy, convert or re-store
   them. Reading uses pi's session-manager helpers, never hand-written parsing.
3. The only epsilon-owned persistent state is `~/.epsilon/ui-state.json` (pins,
   archive, project order). Delete it and the app still works.
4. No `pi-durable`, no `chord`, no database, no ORM.

## Consequences

- **A turn is lost if the server restarts mid-run.** Sessions survive on disk;
  the in-flight model call does not.
- **Interactive-only commands are unavailable.** `/reload`, `/tree`, `/trust`,
  `/login`, `/logout`, `/settings`, `/scoped-models`, `/import`, `/share`, `/bug`,
  `/changelog`, `/hotkeys`, `/debug`, `/quit` are handled by pi's interactive
  mode before any session call. See [../reference/pi-rpc.md](../reference/pi-rpc.md).
  They live in epsilon's terminal tab.
- **Epsilon owns the stream layer**: normalizing RPC events, reconnect
  reconciliation, backpressure, and replaying unanswered extension dialogs.
- **Each child loads its own extensions and MCP servers**, so memory scales with
  live sessions. That is what the cap is for.
- A pi upgrade can change the RPC surface. Upgrade by reading
  `dist/modes/rpc/rpc-types.d.ts` and `dist/modes/rpc/rpc-mode.js`, not by
  assuming compatibility. Pin an exact pi version.

## Rejected alternatives

- **`pi-durable` + `chord`.** Gives crash-proof resume, server-owned state for
  several viewers, and a purpose-built browser link. Rejected because it means a
  separate session store (no session sharing with the terminal), a separate
  extension API (the installed CLI extensions do not come along), four tools
  instead of eight, and an upstream API marked experimental.
  [pinomad](https://github.com/bubbleptr/pinomad) makes the opposite trade and
  documents it in its own ADR-0002; it is the reference if this decision is ever
  revisited.
- **Embed `AgentSession` in the server**, as pi-web does. Buys `ctx.ui.custom`
  support and in-session branch switching, costs an in-process extension UI
  bridge, module-singleton workarounds across bundler graphs, and about nine
  thousand lines of session lifecycle. Rejected as the thing being replaced.
- **Both engines, per session.** Two runtimes, two session stores, two vocabularies
  in one UI. pinomad considered and rejected the same idea for the same reason.

## Revisit if

- Turn survival across a server restart becomes a requirement.
- More than one viewer needs server-owned state rather than client-side
  reconciliation.
- Session sharing with the terminal CLI stops mattering.
