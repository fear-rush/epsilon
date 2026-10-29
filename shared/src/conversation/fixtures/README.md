# Fixtures

Recorded `JsonAgentSessionEvent` logs, one file per hard case. These are the
replay input for `conversation/reduce.ts`: replaying the same file twice must
yield an identical transcript.

## `bash-turn.jsonl`

One complete agent run: a prompt, a `bash` tool call, and the closing assistant
message. 50 events, two turns, ends with `agent_settled`.

Captured from pi 1.4.0 by running the pinned package as a child in its JSON event
mode, answering the permission extension's `confirm` with yes, then keeping only
the event stream. The embedded engine produces the same shape through
`toJsonEvent`.

Two edits were applied to the raw trace, and `replay` does not depend on either:

- The `system` role `message_start` and `message_end` were dropped, and the
  `system` entry was removed from `agent_end.messages`. They carry the full
  system prompt and this machine's skill inventory.
- Absolute paths were replaced with `<project>` and `<home>`.
