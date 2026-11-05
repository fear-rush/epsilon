# Phase 4: Safety checks still open

The rebuild exists to fix concrete failures of `main`: crashes that took every chat
down, races with pi, a hung test suite, leaked processes, slow listing. Most fixes are
built and tested (DECISIONS.md holds why). This file lists what is not, as of 2026-11-04.

Each item ends with a test that would have failed on `main`'s design. A fix without that
test is not done.

## Already proven (for reference, do not redo)

`test/acceptance.test.ts` (F2 a rejected shutdown costs one chat, F3 replaced engines,
F5 a 50,000-entry chat, F6 a prompt cannot hang, F8e, F8h, F8k);
`backend/platform/json-document.test.ts` (F7 a panel write and a pi write keep both
keys); the index conformance test against `SessionManager.listAll`
(`backend/sessions/catalog.test.ts`); the engine cap in the registry; logs with rotation
(`backend/platform/log.ts`); the handshake token and Origin/Host checks.

## Items

- [ ] **F1, moving a running chat.** On `main`, move forked and deleted a session while
      its engine kept writing (`!engines.closeIfIdle(id)` negated a Promise). When move
      is ported (ledger, server table), it refuses a running chat. Test: a running fake
      session → move → refused with "running", file untouched.
- [ ] **F8a** (`test/acceptance.test.ts:242`, todo): a runtime that fails to wire is
      closed before the error is reported.
- [ ] **F8m** (`test/acceptance.test.ts:378`, todo): notices are capped, so a looping
      extension cannot grow the transcript without bound.
- [ ] **e2e**: `bun run test:e2e` passes all specs in `test/e2e/`. Record the duration.
- [ ] **Benchmarks**: `bun run bench` passes its budgets. Record the numbers in the
      commit body.
- [ ] **The index blocks the event loop.** The catalog syncs synchronously inside the
      `epsilon` process; the worker in the original design was never built. A cold build
      measured 375–677 ms on 500 sessions, and during it the socket answers nothing. Measure
      a cold build on a copy of the owner's home; if it exceeds 100 ms, move the sync into a
      Worker (one write connection, as designed) or chunk it, and add a benchmark budget.
      Ask the owner before choosing.
- [ ] **Large files**: read `src/engine/session.ts` (1,347 lines) and
      `src/backend/settings/mcp/service.ts` (784; `config/` before phase 1). Split only
      what holds two concepts, per the File rules; otherwise leave them.
- [ ] **`bun run parity` misreads a quote inside a template literal.** While proving S1 it
      reported seven of main's `error-view` sentences as missing from a file that has them:
      one template literal contains a double quote (`no words for error tag "${String(error)}"`),
      which shifts the scanner's lexical pairing, so later strings are swallowed into one
      non-copy fragment. Skip backtick literals before the double-quote scan, or scan them as
      their own alternative, and add a test with that shape. Until then, hand-verify a file
      whose missing words look present.

- [ ] **A session pi cannot total.** pi's `getSessionStats()` reads `message.usage.input`
      on every assistant message, so a file whose assistant entry has no `usage` throws it,
      and the readings frame calls it on attach: the engine exits, the supervisor records a
      crash, and the next message reattaches into the same crash. The fixture that found it
      was written by hand; pi's own writer always includes usage. `main` made the same call
      inside its snapshot, in the server process. Decide with the owner whether the reading
      is skipped with a notice or the file is refused with words. Test: a chat whose
      assistant entry has no `usage` opens and says what is wrong.

## The review every slice gets

Before a phase 3 slice is committed, check its new code for each of these. Write what
you checked in the commit body.

| Risk    | The question                                                                 | Where the answer is                                                                                          |
| ------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Race    | Can two writers (the panel, an engine, terminal pi) touch this file at once? | pi's lock for `settings.json` via `JsonDocument`; DECISIONS "Concurrent writers are detected, not prevented" |
| Leak    | Is every process, watcher, socket, fiber and timer owned by a Scope?         | AGENTS.md invariant 9                                                                                        |
| Hang    | Does every wait have a deadline, and every test a timeout?                   | [effect.md](../effect.md); `test/until.ts`                                                                   |
| Silence | Does every failure reach a tagged error, an error frame or a notice?         | invariant 10, [02-feedback.md](02-feedback.md)                                                               |
| Growth  | Can a list, a buffer, a cache or a transcript grow without a cap?            | F8m; the engine cap                                                                                          |
| Render  | Does a stream update re-render more than the rows that changed?              | React Compiler is on; virtualized lists                                                                      |
| Bundle  | Does the first paint load a parser, an editor or a highlighter?              | lazy imports (`perf(client)` commits)                                                                        |
