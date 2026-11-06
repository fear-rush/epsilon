# src/engine

Read `docs/rules/server.md` and `docs/pi/README.md` first.

- 1: pi's runtime is imported only here.
- 4: do not invent a pi capability; if `docs/pi/` does not list it, pi does not expose it.
- 8: no `throw`, `try`/`catch`, `new Promise`, `.then`, timers, `Date.now` or `process.env` outside `main.ts`.
