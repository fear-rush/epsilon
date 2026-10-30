# ADR-0004: Write our own RPC driver instead of using pi's `RpcClient`

- Status: Accepted
- Date: 2026-10-28

## Context

`@earendil-works/pi-coding-agent` ships a typed client, `RpcClient`, that spawns
the CLI in RPC mode and wraps every command. It looks like the right foundation
for `server/src/agent/driver.ts`.

Three requirements rule it out, checked against 1.4.0:

1. **Extension dialogs.** A tool call blocks on the permission extension's
   `confirm` request until something answers it. `RpcClient` exposes no way to
   write an `extension_ui_response`, and ignores the incoming request, so a
   tool-using turn would hang with no error. See
   [../notes/2026-10-28-extension-confirm-blocks-a-turn.md](../notes/2026-10-28-extension-confirm-blocks-a-turn.md).
2. **Child exit.** `RpcClient` turns an exit into a rejected request. It never
   reports the exit itself, and an idle child has no pending request, so a
   crashed child would be silent. The UI must say "the agent exited".
3. **The binary.** `RpcClient` spawns `node <cliPath>` hard-coded. The pinned
   package's own bin is the thing we want to run, and the runtime that executes
   it is ours to choose.

## Decision

Own the child in `server/src/agent/driver.ts`: spawn, stdout JSONL framing,
writing commands and dialog answers, and an exit report. Import pi only for
types.

## Consequences

- We maintain framing and exit handling, roughly one file, and we must re-read
  pi's RPC types after an upgrade.
- `onFrame` receives three unions, because pi keeps them apart:
  `JsonAgentSessionEvent` (the transcript), `RpcResponse` (correlated replies)
  and `RpcExtensionUIRequest` (dialogs).
- `send` accepts `RpcCommand | RpcExtensionUIResponse`, for the same reason.
- The driver forwards frames unread. `agent/normalize.ts` stays the single
  place that interprets pi's shapes.

## Rejected alternatives

- **Use `RpcClient` for commands and patch around the gaps.** Its types are
  closed: the private process and pending-request map are not reachable, and it
  drops dialog requests before we could answer them.
- **Drive `pi --print` and parse text.** Loses streaming, steering and dialogs,
  and the terminal would no longer share a live session.

## Revisit if

pi's `RpcClient` gains dialog responses and an exit listener, and stops
hard-coding `node`.
