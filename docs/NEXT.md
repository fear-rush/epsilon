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

- [ ] **A failed step's line says `failed` twice.** `Failed to run bun run test … failed`
      in a run card: `Terminal`'s title already carries the outcome and `ToolTrace`'s
      description repeats it. One of the two should go, for every failed card, not only in
      a run. (Noticed while shooting the run card.)
- [x] **Moving between chats no longer refreshes the sidebar.** pi's thinking-level entry
      on engine start no longer publishes a list change, and an appended chunk's activity
      never falls back to the file's mtime. Covered by a catalog test ("an appended entry
      the list cannot show is not an update"); `sessions.list` calls measured at 1 before
      and after two chat switches.
- [x] **The sidebar and the chat header are quieter.** Row actions appear on their own
      row's hover or focus, a folder no longer reveals its chats' actions, the folder icon
      is the open/closed state, the two `Load more` buttons name their lists, and the chat
      header lost its search and folder pill. Screenshots read: `sidebar-rest`,
      `sidebar-hover`, `project-hover`, `load-more-projects`, `load-more-chats`, `chat-header`.
- [x] **The rail marks the newest turn at the end, and its dots answer the pointer.** The
      active dot no longer follows the row above the fold when the reader is at the end;
      hovering a dot grows it. Covered by `test/e2e/long-chat.e2e.ts` ("the rail marks the
      newest turn"), which fails without the change.
- [x] **One thought line everywhere.** A run step's thinking and an answer's thinking were
      two shapes of the same fact; both now come from `Reasoning`, with the first line
      quoted and the same transition.
- [x] **An older page names itself and does not move the reader.** The transcript holds
      its scroll position when a page is prepended, shows `Loading earlier messages` at the
      top of the scroller, and offers a retry when the page did not arrive. Covered by
      `test/e2e/long-chat.e2e.ts`, which fails with the position kept off.
- [x] **A run of steps is one row.** Landed: `src/domain/conversation/selectors.ts` groups
      the messages, `run-card.tsx` draws them, `test/e2e/run-card.e2e.ts` covers closed,
      open, failed and single-step runs, and `docs/DECISIONS.md` records the rule. The
      doubled 48px row gap is gone with it.

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
