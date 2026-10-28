# The model snapshot is not the model list

## Symptom

The model picker listed 420 models on a home where a terminal `pi` offers 514. On a
home with no credential at all it listed none, which was correct, so the count looked
like it might simply be "what this home has".

## Cause

`ModelRuntime.getAvailableSnapshot()` is a cached view, not an answer. It is built
from what the runtime provisionally considers configured, and it is not updated by the
auth-checked call: after `getAllAvailable()` returned 514 on the same runtime, the
snapshot still returned 420.

The difference is real, not cosmetic. It was entirely openrouter: 387 in the cache
against 481 usable. The dashboard offered the smaller list and `set_model` resolved
against the same cache, so the picker and the engine agreed with each other while both
disagreed with pi.

## Fix

`server/src/agent/models.ts` reads `getAllAvailable()` once when a session opens and
again after `reload`, with a 3 s timeout and the cached snapshot as a fallback. The
snapshot frame carries that list, and `set_model` resolves against it, so a pick the
browser was offered is always accepted.

## Check

Same home, three states, in the browser with a client pointed at the check server:

- `auth.json` + `settings.json`, no `models.json`: 514 items, and picking one changed
  the trigger (it was 420 before the fix)
- the operator's full home: 605 items
- an empty home: no composer, the not-ready notice instead

A stale count is the thing to watch on a pi upgrade:
`grep -n "getAvailableSnapshot" server/src/agent/*.ts` should only appear as the
fallback in `models.ts` and in the readiness check.
