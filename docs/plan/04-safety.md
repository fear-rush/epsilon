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
- [x] **The sessions root is spelled by hand.** `join(home.agentDir, "sessions")` appeared
      in `backend/main.ts`, `sessions/handlers.ts` and twice in `sessions/operations.ts`.
      Now `AgentHomeApi.sessionsDir`, beside `chatsDir`, is the one spelling; the tests that
      hand-built an `AgentHomeApi` literal call `makeAgentHome` instead. Structure hygiene:
      no behaviour change, so no new test, only `bun run check`.
      `refactor(backend): one name for the sessions root`
- [ ] **Large files**: read `src/engine/session.ts` (1,347 lines) and
      `src/backend/settings/mcp/service.ts` (784; `config/` before phase 1). Split only
      what holds two concepts, per the File rules; otherwise leave them.
- [x] **`bun run parity` misreads a quote inside a template literal.** It reported seven of
      main's `error-view` sentences as missing from a file that has them: one template
      literal contains a double quote (`no words for error tag "${String(error)}"`), which
      shifted the scanner's lexical pairing, so later strings were swallowed into one
      non-copy fragment. The scanner now lives in `scripts/parity-surface.ts` and reads
      strings and templates itself, skipping a template's substitutions; its test covers
      both shapes (`scripts/parity-surface.test.ts`).

- [x] **An extension's question at session start never reached the page.** While proving
      the dialogs row, a sandbox extension on `session_start` did `await ctx.ui.confirm(...)`;
      its `setStatus` reached the page, the question did not appear within 20 s, and the dialog
      row stayed unphotographed.
      Cause: pi awaits every `session_start` handler (`runner.js`, `emit`), and the engine
      bound extensions inside `start()`, before `EngineSession.open` resolved. `current` was
      unset, so the supervisor's `subscribe` was dropped silently, no tab existed to receive
      the question, and `ready` waited for a handler that waited for an answer. The chat did
      not open at all: `startEngine` failed with `EngineStopped` after 10 s. The title of
      this item was the mild reading; the real one is a chat that cannot open.
      Fix: `session_start` binding runs in a scoped fiber, `ready` is sent first, and
      `command`/`query` wait on a `bound` deferred, so a page can attach and answer while
      pi is still binding. A bind failure no longer kills the engine before ready; it
      refuses commands with the reason and raises an error notice. `main.ts` logs a dropped
      `subscribe` or `answer` instead of swallowing it. Test: `test/engine.test.ts`, "an
      extension's question during session_start opens the chat and reaches its tab" (fails
      without the fix, passing in 370 ms with it). Still open: a dialog whose tab never
      attaches sits until the chat is reopened, which replays it.

- [ ] **Features still render a thrown error's message.** The translator rule
      (ARCHITECTURE, "One translator") wants `Notice error`/`StatusView error`, with an
      explicit title when the action is more precise than the tag's. Sites found while
      proving S1: `projects/trust-gate.tsx`, `settings/mcp/mcp-add-dialog.tsx`,
      `settings/mcp/mcp-panel.tsx` (the codemode and default-tool reads),
      `settings/mcp/mcp-raw.tsx`, `settings/mcp/mcp-registry-browser.tsx` (search and
      detail) and `settings/mcp/mcp-signin.tsx`. pi's data messages (a test result, a
      login question, a parse problem) are not thrown errors and stay. The phase 2 grep
      misses variables named otherwise (`failed.message`, `models.error.message`), so
      re-run it and read every hit.
      The shared `DeleteDialog` now renders `Notice error` instead of `error.message`,
      because a tagged error's `message` is empty and the alert drew as an empty box: every
      delete refusal in the app has the translator's words from S3 on.

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
