# What is left

The port is finished: every feature, screen and word of `main` (`48226bb`) is on this
branch, and the ledger that tracked it is [archived](../archive/docs/plan/ledger.md). What
remains is one decision, two runs, and the merge. Status lives here and nowhere else.

## Open

- [ ] **The first-paint budget is over.** `bun run bench` fails one budget: `bundle-size`
      reads **392.8 KiB against 315**, for `/` and `/sessions/$id`. Every other budget is
      within. Built at five commits, first paint was 310.1 KiB before the chat port,
      **360.3 KiB at the first checkpoint after the composer, palette and transcript
      landed**, 364.7 at S8, 368.4–368.5 through S9, and 392.8 after the AI Elements pass. So the 83 KiB over the pre-chat baseline is the
      ported chat surface; React (66.8), Effect (51) and TanStack (38.5) are 156 KiB of
      the 392 and are the foundation's own cost. Two ways out, and the owner picks: - defer the palette and the model menu out of first paint (worth ~21–30 KiB, still
      short of 78), or - set the budget to the branch's own figure with that reasoning recorded.
- [ ] **The owner uses `bun run dev:host` for a day with no regression.** Nothing can
      stand in for this: the sandbox is fresh, the real home has 625 chats and none of them
      names a folder that no longer exists (the 333 stale ones were removed on 2026-11-06).
- [ ] **The deferred feedback screenshots.** Phase 2 landed without them, by the owner's
      call: a route that throws, an unknown session id, the server stopped, a refused save
      and a field error, light and dark. Their surfaces are covered by `test/e2e/`, so this
      is a record, not a gap.
- [ ] **Merge to `main` when the owner says so.** Then delete this file. The rebuild plan
      and ledger stay in [`archive/`](../archive/README.md); they are history, not
      instructions.

## Done, for the record

The six checks that gate a merge were run on 2026-11-05:

- `bun run check` — 307 tests, 0 failures, 0 todos, suite 10.3 s.
- `bun run test:e2e` — 15 passed in 24.1 s.
- `bun run bench` — every budget within except `bundle-size` (above).
- Read-only run on a `cp -c` clone of the owner's real 1.8 GB home: 955 chats indexed in
  16.0 s, pi's settings read as 48 rows with 0 problems, and six chats opened through
  their engines (the three largest at 51, 23 and 16 MB, plus three recent ones).
- The cold index build no longer holds the socket: 15.7 s of work in 40 ms slices, and the
  longest stall a waiting fiber sees is 49 ms of a 100 ms budget.
- A chat pi cannot total opens and says why instead of taking the engine down.
