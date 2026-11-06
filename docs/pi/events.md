# pi reference: Events

## Events

`JsonAgentSessionEvent` is the type the reducer reads. `message_start` gives the
initial message, deltas build on it, and `message_end` gives the authoritative
message. A refused provider call is an assistant `message_end` with
`stopReason: "error"` and an `errorMessage`; there is no separate error event.

Run lifecycle: `agent_start`, `turn_start`, `turn_end`, `agent_end`, `agent_settled`

Messages: `message_start`, `message_update`, `message_end`, `entry_appended`

Tools: `tool_execution_start`, `tool_execution_update`, `tool_execution_end`

Compaction and retries: `compaction_start`, `compaction_end`, `auto_retry_start`,
`auto_retry_end`, `summarization_retry_scheduled`,
`summarization_retry_attempt_start`, `summarization_retry_finished`

Session and queue: `queue_update`, `session_info_changed`,
`thinking_level_changed`, `bash_execution_update`

Extension lifecycle names (`session_start`, `session_shutdown`, `tool_call`,
`project_trust` and the rest) are `ExtensionEvent`s the extension subscribes to in
`pi.on(...)`, not members of the `AgentSessionEvent` union the socket carries. A host
does not receive them as frames.

`bash_execution_update` exists in the union but pi's own UI ignores it. The `bash`
tool also records a `bashExecution` message in the session, which reaches a reader
only through the session's messages
(see Traps).

`bash_execution_update` carries the `id` a caller passed to `executeBash` and one
`delta` per chunk, so a host that passes an id can show a command's output while it
runs and tell two runs apart. Without an id the field is absent, which is what pi's
own interactive mode does.

`compaction_end` reports its own outcome and nothing else does: `reason`, a `result`
carrying `summary`, `firstKeptEntryId`, `tokensBefore`, `estimatedTokensAfter`, the
summarizer's `usage` and any `details`, plus `aborted`, `willRetry` and
`errorMessage`. A successful compaction also appends a `compaction` entry, which is
what a snapshot shows as a `compactionSummary` message.

`entry_appended` is pi's append-only record, not a message stream. `custom_message`
entries become messages (`getMessages()` projects them, with `display` as pi wrote
it); a plain `custom` entry is bookkeeping and is drawn only by a renderer the
extension registered for its `customType`
(`session.extensionRunner.getEntryRenderer(customType)`). pi draws nothing for the
rest, and neither does a faithful host.

`tool_execution_start`, `tool_execution_update` and `tool_execution_end` carry
`parentToolCallId` when another tool made the call (`ctx.executeTool()`, as a
codemode script does), and the model-issued call's tool result carries the bounded
record of them in `nestedCalls` (`{ calls, complete }`). The record keeps the call,
its arguments up to pi's size limits, `status: "ok" | "error" | "unfinished"`,
`durationMs` and pi's truncated error text; it keeps no results. A nested call is
never a top-level row and is not a message of its own.
