# `bun run test` takes about 11 s against a 10 s budget

Measured 2026-11-06 at step 04 of the docs plan, 313 tests in 46 files: 11.00 s, 10.93 s,
10.94 s (median 10.94 s). The budget in `docs/rules/testing.md` TS-1 is 10 s for the suite.

Do: find which files dominate the run (`bun test` prints each file's time) and make them
faster, or split what is slow into the e2e suite.
Don't: raise the budget or the per-test timeout.
Done when: `bun run test` reports under 10 s three times in a row.
Stop and ask when: the time is spent in a test that proves something no faster test can.
