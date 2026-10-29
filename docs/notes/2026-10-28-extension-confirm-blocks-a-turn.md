# A permission confirm blocks the turn until the host answers

Date: 2026-10-28

## Symptom

A prompt that uses a tool never finishes. The trace shows `tool_execution_start`
and then nothing. No `tool_execution_end`, no `agent_end`, no error. The session
stays alive.

## Cause

The permission extension answers a tool call through `ctx.ui.confirm`, which waits
for the host's `ExtensionUIContext`. In the terminal a human presses a key. A host
that never answers leaves the tool call waiting forever: the wait is not reported
as an error, and pi does not apply a timeout of its own.

The same pattern appears at session start, before any prompt: `setStatus` and
`setWidget` calls arrive, so the extension UI channel is live from the first
millisecond.

## Fix

Answer the request. Epsilon stores the question, sends it to the browser as a
dialog frame, and forwards the answer. A read-only trace may auto-confirm.

## Check

Epsilon's S5 browser pass: a `bash` turn raises `Allow bash? …`, refusing it marks
the tool card `failed`, and the turn settles. Without an answer the same turn
stalls after `tool_execution_start`.
