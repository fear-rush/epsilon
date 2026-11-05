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

- [x] **F1, moving a running chat.** On `main`, move forked and deleted a session while
      its engine kept writing (`!engines.closeIfIdle(id)` negated a Promise). Move now
      refuses a running chat: `operations.test.ts`, "moving a running chat is refused and
      the file stays where it is (F1)" — a running id, `SessionRunning`, one file left.
      The same file covers the all-or-nothing project delete.
- [x] **F8a**: a runtime that fails to wire is closed before the error is reported.
      Nothing in a real `start()` can reject (the lock and watcher are `never`), so the
      item needed the seam it names: `EngineOpenHooks.afterStart` fails an open after the
      runtime, lock and watcher exist. With it, `session.test.ts` proves the release: the
      `<file>.epsilon-lock` is gone afterwards, and the test fails when the
      `Effect.onError(dispose)` is removed.
- [x] **F8m**: notices are capped, so a looping extension cannot grow the transcript
      without bound. Two caps: the engine keeps the newest 200 (`noticeLimit` in
      `engine/session.ts`) and the reducer does the same (`reduce.test.ts`, "caps notices
      and keeps the newest").
- [ ] **e2e**: `bun run test:e2e` passes all specs in `test/e2e/`. Record the duration.
      Ran 2026-11-05: **8 passed, 7 failed in 32.7 s** (with the build, 35 s wall). They are
      stale selectors against the rebuilt UI, not crashes. Verified: `onboarding.e2e.ts`
      waits for a link named "add provider" while `providers-panel.tsx` renders a button.
      `controls.e2e.ts` times out clicking in the tree, compact and fork dialogs;
      `projects.e2e.ts` finds no trust control; `skills-import.e2e.ts` waits on a file
      input the dialog does not mount at that step; `long-chat.e2e.ts` fails its scroll
      assertion. Each flow has to be walked against the running app and the spec updated
      to the control the page now draws.
- [ ] **Benchmarks**: `bun run bench` passes its budgets. Ran 2026-11-05 on a quiet
      machine: `catalog-list` 0.74 ms (≤20), `catalog-cold` 578 ms (≤1500, 631 ms on a
      second run), `catalog-append` 65 ms (≤100; 124 ms on a machine at load 5.5),
      `open-window` 3 ms (≤50) with a 69 KiB window frame (≤2048), `engine-spawn` 379 ms
      (≤600), `client-stream` 0.04 ms (≤50).
      Two reasons it is not green:
      `client-stream` was a placeholder that failed the whole run at step 8; it is built
      now (`scripts/bench/client-stream.ts`, the reducer over 200 deltas in a 2,000-row
      chat), which let the run reach `bundle-size` for the first time:
      **369.5 KiB against 315** for both `/` and `/sessions/$id`. That is a first-paint
      budget to meet by code-splitting the shell or the route entries — or to revise —
      and it is the owner's call which.
- [ ] **The index blocks the event loop.** The catalog syncs synchronously inside the
      `epsilon` process; the worker in the original design was never built. A cold build
      measured 375–677 ms on 500 sessions, and during it the socket answers nothing. The
      benchmark now puts it at 578–631 ms, and an incremental reconcile after one append
      at 65 ms (124 ms at load 5.5). Measure
      a cold build on a copy of the owner's home; if it exceeds 100 ms, move the sync into a
      Worker (one write connection, as designed) or chunk it, and add a benchmark budget.
      Ask the owner before choosing.
- [x] **The sessions root is spelled by hand.** `join(home.agentDir, "sessions")` appeared
      in `backend/main.ts`, `sessions/handlers.ts` and twice in `sessions/operations.ts`.
      Now `AgentHomeApi.sessionsDir`, beside `chatsDir`, is the one spelling; the tests that
      hand-built an `AgentHomeApi` literal call `makeAgentHome` instead. Structure hygiene:
      no behaviour change, so no new test, only `bun run check`.
      `refactor(backend): one name for the sessions root`
- [ ] **"N models can run a turn" counts models that cannot.** The General page's Status row
      reads `settings.providers.models`, which is pi's whole composed catalog — 1693 rows on
      the dev sandbox, against main's 94 — so a provider with no credential inflates the
      number the row promises. Found while settling S8 against main's screenshot; the fix is
      main's enabled set (`readEnabledModels`), not a rewording, unless the owner prefers the
      catalog count. Test: the count equals what the Default model picker offers.
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
