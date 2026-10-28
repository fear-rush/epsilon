# ADR-0007: Embed pi's engine in a worker of our own

- Status: Rejected
- Date: 2026-10-28

## Context

While planning onboarding, this looked like the natural next step. pi's RPC surface
has no login, settings or trust command, while its library has all of them. If the
engine ran inside our process, configuration would stop being a protocol problem.
The proposal was to spawn a worker that imports
`@earendil-works/pi-coding-agent`, creates an `AgentSession`, and speaks the frame
vocabulary the browser already understands.

It was written down as a proposal before implementation, with a parity spike as the
gate. Working the spike's design made the cost visible, and ADR-0006 removed the
requirement that motivated it. The proposal was never accepted, so this record
replaces it rather than superseding one ahead of it.

## Decision

Do not embed the engine. Sessions stay on `pi --mode rpc` as a child process
([ADR-0001](0001-engine-rpc-child.md), [ADR-0004](0004-own-the-rpc-driver.md)).
Configuration stays in the terminal inside the deployment
([ADR-0006](0006-setup-in-the-deployment-terminal.md)).

## Why it was rejected

1. **The requirement disappeared.** The only capability RPC lacks is
   configuration, and ADR-0006 puts that in the terminal that pi already ships. The
   library was a solution to a problem we chose not to have.
2. **The surface is open-ended for sessions.** Driving `AgentSession` means owning
   tool exposure, MCP and codemode wiring, resource loading, event ordering, reply
   envelopes, session replacement and `toJsonEvent` parity. Any drift looks like a
   healthy session with missing tools, which is the worst failure shape. pi
   maintains a frontend for exactly this and calls it RPC mode.
3. **It repeats a rejected decision one layer down.** ADR-0002 rejected a
   per-extension UI adapter because "the set of extensions is open-ended, so the
   adapter cost has no ceiling". A hand-written engine frontend is that argument
   with a larger constant.
4. **It buys nothing the product needs.** The image still needs Node, crash
   containment already exists, and the RPC surface is a documented, supported
   integration point (`docs/cli-integration.md` in the pinned package).

## What it would have bought

Recorded so the trade is not re-discovered as a win:

- `session.reload()`, which RPC has no equivalent for, so an install would not
  need an idle-gated restart. RPC's restart is acceptable and already planned.
- `navigateTree`, so `/tree` would work in the browser. It remains terminal-only.
- No JSONL middleman and direct calls for `compact`, stats and session metadata.
  Convenience, not capability.

## Revisit if

- The image should contain no `pi` binary or CLI at all, and the container must be
  as small as possible.
- pi stops maintaining RPC mode, or RPC loses a capability we depend on.
- A requirement appears for multi-client fan-out or resume after a crash, which is
  what `@earendil-works/pi-durable` exists for. That is a different decision with a
  different record.
