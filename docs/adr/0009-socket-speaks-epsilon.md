# ADR-0009: The socket speaks Epsilon's vocabulary

- Status: Accepted
- Date: 2026-10-28

Supersedes decision 2 of
[0008](0008-embed-pi-engine-with-opinions.md), which said the browser contract
would not change. Narrows [0002](0002-own-the-ui-contract.md) decisions 1 and 3:
Epsilon still owns the UI contract, and now it owns the wire shapes too. Every
other decision in 0008 stands.

## Context

0008 embedded the engine but left pi's RPC vocabulary on the browser wire: the
`rpc` frame carried an `RpcCommand`, replies were `rpc-result`, the snapshot held
an `RpcSessionState`, and dialogs were `RpcExtensionUIRequest` values answered
with `RpcExtensionUIResponse`. With no RPC envelope under it, that vocabulary
became a translation layer for a mode epsilon no longer runs, and every change to
pi's private RPC types would have been a change to Epsilon's public contract.

Three facts in the pinned package (1.4.0) decided the details. Each one
contradicted a document that claimed otherwise:

1. **`toJsonEvent` is not exported.** The package exposes `.` and `./rpc-entry`;
   `dist/modes/json-event.js` is a private module and a deep import fails in both
   Node and Bun. Only the `JsonAgentSessionEvent` type is public, so a host that
   needs the transform carries it.
2. **`mode` is not on `AgentSessionConfig`.** It belongs to `ExtensionBindings`,
   passed as `session.bindExtensions({ mode: "rpc", uiContext })`.
3. **The CLI's built-in extensions are `builtin: true` entries.** They live in
   `dist/extensions/index.js` as `{ name, factory, replaceable: true, builtin: true }`,
   not as plain inline factories. `builtin` makes `builtin:<name>` a resource the
   operator can disable, and `replaceable` lets an operator extension take over.

## Decision

1. The protocol is version 4. A tab sends `command` with one of six names:
   `prompt`, `steer`, `abort`, `bash`, `set_model`, `reload`. The server answers
   `command-result` carrying the command name, so a refusal can name what failed.
2. `shared/` owns the wire shapes as zod: the snapshot, the dialog question, the
   answer and the display request. `shared/src/pi.ts` keeps only
   `JsonAgentSessionEvent`, because that is the reducer's input.
3. The engine carries pi's JSON event transform and points at the private module
   it mirrors. Re-verification on an upgrade happens against
   `dist/modes/json-event.js`, not against an exported symbol.
4. The three built-ins are registered the way the CLI registers them, with
   `builtin: true` and `replaceable: true`, so `pi config` and the operator's
   extensions arbitrate them by name.
5. `mode: "rpc"` travels on the extension binding, not on the session config.
6. `/reload` is a socket command: the composer intercepts it and the server calls
   `session.reload()`. It is Epsilon's own command, not a pi slash command, so
   the model never receives it.

## Consequences

- The protocol bump is real. A tab built before this change reloads on
  `PROTOCOL_MISMATCH`, which is the rule already in `docs/protocol.md`.
- The adapter is small because every command has a UI caller. A command the page
  cannot send is not on the wire.
- A pi upgrade now touches `agent/engine.ts` and the JSON transform. The frames,
  the reducer and the dialogs are unaffected unless pi's event shapes change.
- Dialog timeouts are Epsilon's. pi's RPC had its own; the engine enforces
  `ExtensionUIDialogOptions.timeout` and answers `cancelled` when it expires.
- `set_editor_text` still has no composer to write into and shows a notice.
  Methods that need pi's TUI notify once per method instead of failing silently.

## Rejected alternatives

- **Keep pi's RPC types "for compatibility".** No tab in production speaks the old
  frames; the deployment serves the client and the API together. Keeping them
  would leave a documented surface with no implementation behind it.
- **Deep-import the JSON transform.** It is blocked by the package's `exports`
  map today, and an unversioned path would break silently on an upgrade. Twenty
  lines with a named source are cheaper than a resolver trick.
- **Keep request/response frames for reads** (`get_state`, `get_messages`,
  `get_commands`). The engine exposes all of it synchronously, so a snapshot can
  be built without a round trip and without a timeout to tune.

## Revisit if

- pi exports the JSON transform and a session API with the same guarantees, which
  would let the engine drop its local copy.
- A second host (a CLI, a test harness, another language) has to speak this
  protocol, which would make a published schema the better home for these shapes.
