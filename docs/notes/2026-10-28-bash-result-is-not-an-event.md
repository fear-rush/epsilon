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
reply, the same way it already did after `set_model`, and re-reads once more at
`agent_settled` for the message pi held during a run. No protocol change: the
frame shapes stayed the same.

## Check

Run `!echo hi` in a session and watch the frames. A `snapshot` frame with a
`bashExecution` message follows the `rpc-result`. Driven without a browser by
attaching a WebSocket to `/api/link` and sending
`{ "type": "bash", "command": "echo hi" }`.
