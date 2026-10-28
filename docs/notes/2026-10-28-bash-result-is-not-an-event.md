# A bash result is a message, not an event

## Symptom

`!echo hello` answered `ok` over the socket and the browser showed nothing. A
reload showed the card, so the message was in the session file the whole time.

## Cause

Pi's `executeBash` streams `bash_execution_update` deltas, then calls
`recordBashResult`, which appends a `bashExecution` message to the session
manager. That append emits no `message_start`/`message_end` event, and
`bash_execution_update` carries only an id and a delta, so the reducer has no
final output, exit code or timestamp to render. When a run is streaming, pi
holds the message in `_pendingBashMessages` and appends it when the run settles.

## Fix

`server/src/agent/session.ts` re-reads the snapshot after a successful `bash`
command, the same way it does after `set_model` and `reload`, and re-reads once
more at `agent_settled` for the message pi held during a run. The bug outlived the
RPC driver: an embedded engine calls `executeBash` directly, and pi still appends
the message without an event.

## Check

Run `!echo hi` in a session and watch the frames. A `snapshot` frame with a
`bashExecution` message follows the `command-result`. Driven without a browser by
attaching a WebSocket to `/api/link` and sending
`{ "t": "command", "sessionId": "...", "command": { "type": "bash", "command": "echo hi", "excludeFromContext": false } }`.
