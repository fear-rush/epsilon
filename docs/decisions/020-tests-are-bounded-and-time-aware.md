# Tests are bounded and time-aware

**Decision**

`bun test` with an Effect wrapper; `TestClock` for every timer; `until()` as the only waiting helper; a suite budget of 10 s; real-process tests under 5 s with a finalizer.

**Why**

A hanging test teaches nothing and blocks the next step, and a real sleep makes a one-second test into a two-second one for no information. Cost accepted: anything that genuinely needs wall time says so in a comment.

**Rejected**

vitest and `@effect/vitest`; the repo's runner stays `bun test`.
