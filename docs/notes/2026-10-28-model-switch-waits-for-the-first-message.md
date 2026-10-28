# A model switch before the first message is lost

## Symptom

In a brand-new session, the model picker is switched, the page reloads, and the
picker is back on the old model. A turn after the reload uses the old model.

## Cause

`setModel` appends a `model_change` entry to the session manager. pi writes the
JSONL lazily: a session created with an exact id has no file until its first
message. The model change sits in memory, the reload disposes the engine, and the
entry goes with it.

## Fix

None in Epsilon. The switch is in memory until the session file exists, and after
that it persists and survives a reload. Forcing a file on a fresh id would make
browsing write to the home, which the project does not do
([note](2026-10-28-fresh-session-id-writes-no-file.md)).

## Check

New session, switch the model, reload: the old model returns. Send one message,
switch again, reload: the new model stays, and the next assistant message records
the new `model` field in the JSONL.
