# Disposing on the last detach kills the run

## Symptom

Two checks failed together after the engine moved in-process:

- Closing a tab mid-run stopped the answer, so reopening showed a truncated turn.
  S3 asks for the opposite: the run continues.
- Reloading the page while a permission prompt waited lost the prompt, because the
  new attach built a fresh engine with no pending dialog. S5 asks for the prompt
  to be shown again.

## Cause

The first version of `LiveSession` disposed the engine as soon as the last socket
unsubscribed. A reload or reattach always starts with that unsubscribe, so the
engine was always gone before the new tab attached.

## Fix

Dispose on a ten second idle timer instead, and only when the engine is idle. A
run, a compaction or a pending dialog keeps the session alive with no tab. A new
subscribe cancels the timer. The tests then showed the run growing from 172 to 548
characters across a close and reopen, and a pending dialog being replayed after a
reload.

## Check

Close the tab mid-run, reopen four seconds later: the answer is longer than when
the tab closed. Reload while a dialog waits: the dialog is back. Close an idle
session, wait twelve seconds, and `GET /api/sessions` reports `running: false`.
