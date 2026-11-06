# src/backend

Read `docs/rules/server.md` first.

- 1: pi's runtime is imported only in `src/engine/`; pi's exporters, trust and sessions only in `platform/pi.ts`.
- 5: credentials change only through `ModelRuntime.login()`/`logout()`; other files through a writer or `JsonDocument`.
- 8: no `throw`, `try`/`catch`, `new Promise`, `.then`, timers, `Date.now` or `process.env` outside `platform/` and the entry files.
- 9: every resource belongs to a Scope; nothing is fire-and-forget.
- 11: time comes from `Clock`; tests use `TestClock`.
