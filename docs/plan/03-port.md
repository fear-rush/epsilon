# Phase 3: Port `main` 1:1

`main` (`48226bb`) is the specification of what Epsilon does and how it looks. This
phase brings every feature, screen, word, animation and test of `main` onto the branch.
The checklist is [ledger.md](ledger.md); its slices S2–S9 are this phase, in order (S1 is
[phase 2](02-feedback.md)).

## Rules

1. **Nothing of `main`'s is dropped.** A feature, control, menu item, shortcut, dialog,
   route, word, animation or test on `main` is on this branch. Dropping or changing one
   needs the owner's written yes, recorded with the date in its ledger row. "The plan
   did not mention it" is not a reason.
2. **Port, do not rewrite from memory.** Open `main`'s file with `git show main:<path>`
   and carry over its markup, class strings, copy, ARIA, keys, `data-*` attributes and
   motion as they are.
3. **What may differ from `main`**, and nothing else:
   - where data comes from (`fetch`/OpenAPI → `call()`, queries, the socket runtime);
   - schemas (zod → Effect Schema; forms through `Schema.toStandardSchemaV1`);
   - import paths and file boundaries, per
     [ARCHITECTURE.md, File rules](../ARCHITECTURE.md#file-rules);
   - the feedback surfaces of [phase 2](02-feedback.md);
   - render performance (memo, virtualization, lazy code; DECISIONS.md "Virtualize the
     transcript and the session list"), as long as pixels and motion do not change.
4. **Same tree, same motion.** Keep `animate-*`, `enter-*`, `transition-*`, `duration-*`,
   `data-[state=…]` variants, a dialog's always-mounted content, the key that remounts a
   row, and the condition that triggers each. `index.css`, `typeset.css`,
   `styles/tokens.css` and `styles/motion.css` are identical to `main`'s; keep them so.
5. **The app runs after every commit.** `bun run dev` opens and every route already
   ported still works.
6. **A missing server call is part of the slice.** Add it in the same slice
   (`src/protocol/` → handler → UI), per AGENTS.md "Add to a root". The ledger's server
   table lists the known gaps.
7. **Tests are ported too.** `main` had 65 test files, among them 93 tests over
   `shared/` (now `src/domain/`, which has none for `mcp`, `skills` or `providers`) and
   12 client tests (the branch has no client tests). Port each file's tests with it, onto
   the branch's harness.
8. **Everything in AGENTS.md still holds**: invariants, Effect rules, time from `Clock`,
   bounded tests, the 10 s suite budget.

## How to port one ledger row

1. **Read both sides.** `git show main:client/src/<path>`, plus the files of its
   feature that it imports. Find the branch's counterpart, if any.
2. **Port.** Copy the JSX, class strings and copy as they are; change only what rule 3
   allows. `main`'s error and loading markup becomes the phase 2 surfaces.
3. **Fill the server gap**, if there is one, with its handler test.
4. **Prove the markup.**
   `bun run parity client/src/<main path> src/app/<branch path> [more branch paths]`
   lists `main`'s class tokens and copy that the port lacks, and fails if there are any.
   If something moved into a shared component, add that file to the paths. A token that
   is truly gone (the feedback system, a fixed bug) goes in the commit body with the
   reason.
5. **Port `main`'s tests** for the file.
6. **Prove the pixels.** Screenshot the same route and state on `main` and on the branch,
   against the same sandbox data, and compare the images yourself.
   - `main`: `git worktree add ../epsilon-main main`, then `bun install` and
     `bun run dev` in it. Both use ports 3000 and 5173 and the same sandbox, so run one
     at a time.
   - Shoot with headless Chrome:
     `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --user-data-dir=<scratch>/profile --window-size=1600,1000 --virtual-time-budget=6000 --screenshot=<scratch>/<name>.png http://localhost:5173/<route>`
   - Every state the row has, at least one of them: data, empty, loading, error, a dialog
     open. Add dark and 390×844 when the row changes the shell; a state that differs at
     that width is the row's own to prove.
   - One shot per 15 s with a hard deadline on the command. A page that has not settled by
     then is a finding: report it with the console error, do not wait for it.
   - Motion cannot be screenshotted: step 4 proves the classes; open and close each
     dialog and menu in the running app to see it.
7. **Check**: `bun run check` green, the suite within 10 s.
8. **Tick** the ledger rows in the same commit, with the commit subject on the row.

## Slices

One slice is one or more commits; each leaves the app running.

| Slice | What                                                                                                                                                                                                                                                                        | Why here                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| S2    | Chat: session view and header, composer (attachments; model, thinking, tools and permission menus; context meter; cache warming; palette and built-in commands), tool trace, reasoning, run status, branches, fork, compact and export dialogs, the missing engine commands | used every minute                       |
| S3    | Sessions sidebar and projects: row menu, move, a project's chats, continue session, trust gate                                                                                                                                                                              |                                         |
| S4    | MCP: list, `/settings/mcp/$scope/$name`, form, raw editor, exposure, tools, OAuth sign-in, registry browser and add dialog                                                                                                                                                  | the largest gap; the server side exists |
| S5    | Providers: connection, test, logout, import dialog, model dialog and editor, reasoning fields                                                                                                                                                                               |                                         |
| S6    | Skills: file tree and dialogs, raw pane, references, paths, foreign skills, notices, import steps                                                                                                                                                                           |                                         |
| S7    | Context: `/settings/context/$section`, panel, detail                                                                                                                                                                                                                        |                                         |
| S8    | General, Packages, the settings shell; the branch-only Projects and Diagnostics pages restyled on `main`'s patterns                                                                                                                                                         |                                         |
| S9    | Shared components and editor: settle each "changed" row                                                                                                                                                                                                                     |                                         |

## Done when

- [x] Every ledger row is ticked or carries the owner's dated yes to differ.
- [ ] `src/domain/` and `src/app/` carry `main`'s tests for what they port. Five of
      `main`'s nine shared test files have no direct counterpart yet:
      `conversation/display.test.ts`, `conversation/events.test.ts`,
      `conversation/replay.test.ts`, `mcp/tools.test.ts`, `providers/endpoints.test.ts`.
      Some of their cases are covered elsewhere (`domain/conversation/reduce.test.ts`,
      `backend/settings/providers/handlers.test.ts`); each file needs the decision
      "port it" or "this test covers it", not a blanket skip.
