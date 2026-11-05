# Plan: finish the rebuild

Status board for `refactor/rebuild`. Started 2026-11-04; `main` is at `48226bb`.

## The goal

This branch is `main` (every feature, screen, word, animation and test) on a better
foundation: Effect, typed errors, one engine process per chat, the SQLite session index,
one socket with typed calls, one package, bounded and time-aware tests. The one
deliberate visible change is a consistent feedback system.

What the foundation is and why it was chosen: [DECISIONS.md](../DECISIONS.md). The
foundation is built and stays; what remains is structure, parity and safety.

## Phases, in order

Work on the first phase that is not done. Inside a phase, take the first unticked item.

| #   | Phase                                                 | File                                             | Status                                                          |
| --- | ----------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| 1   | Structure: one name per concept, rename and move only | [01-structure.md](01-structure.md)               | done: `refactor(structure): one name per concept in every root` |
| 2   | Feedback system                                       | [02-feedback.md](02-feedback.md)                 | done; screenshots not taken (owner's call)                      |
| 3   | Port `main` 1:1, slice by slice                       | [03-port.md](03-port.md), [ledger.md](ledger.md) | in progress: S3, S6, S7 and S8 done; S9 next                    |
| 4   | Safety checks still open                              | [04-safety.md](04-safety.md)                     | partly done                                                     |
| 5   | Merge                                                 | below                                            | not started                                                     |

Update the Status column in the commit that changes a phase's state.

## How to work an item

1. Read this file, then the phase file, then the docs its item names.
2. Do the item, and only the item. Something else you notice goes in the phase file as a
   new unticked item, not into this commit.
3. Prove it: what the phase file's _Done when_ asks for, plus `bun run check` (format,
   lint, types, Knip, tests within 10 s). For UI, the screenshots in
   [03-port.md](03-port.md#how-to-port-one-ledger-row).
4. In the same commit: tick the item, update ARCHITECTURE.md if the code's shape
   changed, add to DECISIONS.md if you made a choice someone could reverse.
5. Commit: `type(scope): what changed` (feat, fix, refactor, perf, test, docs, chore).
   One item or one ledger slice per commit.
6. Report: what changed, the evidence (commands and their results, the test duration,
   screenshot paths), and anything you could not do.

## Stop and ask the owner when

- something of `main`'s seems wrong, unused or not worth porting;
- a visible change beyond the feedback system seems better;
- the work needs a pi capability [pi-sdk.md](../pi-sdk.md) does not list;
- a check fails for a reason you do not understand, or a run passes its time budget.

Do not decide these yourself, and do not route around them.

## Phase 5: merge

- [ ] Every ledger row is ticked or carries the owner's dated yes to differ.
- [ ] `bun run check`, `bun run test:e2e` and `bun run bench` pass.
- [ ] Run against a read-only copy of the owner's real home: the index builds, every chat
      opens, settings round-trip.
- [ ] The owner uses `bun run dev:host` for a day with no regression.
- [ ] Delete `docs/plan/`; ARCHITECTURE and DECISIONS already hold what lasts.
- [ ] Merge to `main` when the owner says so.
