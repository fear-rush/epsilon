# `z.custom` without a checker checks nothing

## Symptom

`shared/src/protocol/frames.ts` described the socket as "parsed with these
schemas", and both sides called `.parse` on every frame. Sending
`{ t: "snapshot", sessionId: "x", snapshot: { wat: 1 } }` still parsed, and a
snapshot without `messages` reached the reducer and threw inside a render.

## Cause

`z.custom<T>()` with no argument returns a schema that accepts every value. The
two frame fields that carried pi's types (`snapshot` and `event`) used it, so the
parse validated the envelope and nothing inside it. The comment promised more
than the schema did.

## Fix

`snapshot` is a real schema: `state`, `models` and `commands` are checked field by
field, and each message is checked for a known `role`. The event payload keeps
pi's type and is checked as an envelope (an object with a string `type`), which is
what the page dereferences; the reducer parses the content it draws. A frame that
fails the check is reported once per connection instead of being dropped in
silence, and the server sends a sentence instead of throwing when it cannot
describe an outbound frame.

## Check

`bun run test` in `shared/` replays every recorded fixture through
`serverFrameSchema` and the reducer. The snapshot fixture is parsed by the real
schema, so a missing field fails the test rather than the browser.
