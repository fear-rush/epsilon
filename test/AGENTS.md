# test

Read `docs/rules/testing.md` first.

Budgets: a targeted e2e 30 s, the full e2e 60 s; the unit suite has none. Time comes from `TestClock`.

Tests use a temp agent home from `test/setup.ts` (invariant 6).
