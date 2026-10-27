# The permission extension blocks an RPC turn until something answers `confirm`

Date: 2026-10-28

## Symptom

A prompt that uses a tool never finishes. Stdout shows `tool_execution_start`
and then nothing. No `tool_execution_end`, no `agent_end`, no error, no exit.
The child stays alive and the trace script hits its own timeout.

## Cause

The permission extension answers a tool call by sending an
`extension_ui_request` with `method: "confirm"`, and waits for
`extension_ui_response`. In TUI mode a human presses a key. Under `--mode rpc`
nothing answers, so the tool call waits forever. `--mode rpc` does not
auto-approve, and the wait is not reported as an error.

The same pattern appears at child start, before any prompt: `setStatus` and
`setWidget` requests arrive, so the extension UI channel is live from the first
millisecond.

## Fix

Answer the request. For a read-only trace, reply with
`{ type: "extension_ui_response", id, confirmed: true }`. For epsilon, `extui`
stores the request, sends it to the browser, and forwards whatever comes back.

## Check

`AUTO_CONFIRM=1 PROMPT="Run the bash command 'echo hello-from-epsilon' and then tell me its output in one sentence." bun run scripts/trace-rpc.ts`

Reaches `agent_settled`. Without `AUTO_CONFIRM=1` the same command stalls after
`tool_execution_start`.
