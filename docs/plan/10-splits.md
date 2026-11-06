# 10 Split the large files

No visible change. Smaller files mean an agent reads less to change one thing, and the
transcript stops re-rendering every row per streamed token. Evidence:
[findings.md → Structure](findings.md#structure).

Rule for every split: move code, do not rewrite it. Same names, same behaviour, same
comments. One file per split below, one commit for the whole step.

## Do

1. **`features/conversation/transcript.tsx`** (780 lines; `Transcript` ~233–570 with 22
   hooks):
   - `transcript-rail.tsx`: `TranscriptRail` (~121–233) and its helpers.
   - `transcript-rows.tsx`: `Row`, `AssistantRow`, `StreamingRow`, `CopyReply`. Wrap
     `Row` and `AssistantRow` in `memo`; a settled row must not re-render while another
     streams. Prove it with React Profiler or a render counter in a unit test.
   - `use-transcript-scroll.ts`: virtualizer, anchor, older-page loading, end threshold.
   - `transcript.tsx` keeps `Transcript` composing them, and the pure helpers (`rowText`,
     `previewOf`, `treeUserRows`) unless a second file needs them.
   - Fix the `oxlint-disable` at ~362 (mount-only effect) with a reason or remove it.
2. **`features/conversation/composer.tsx`** (695 lines; `Composer` ~123–end):
   - `use-composer-attachments.ts`: paste, drop, `readAttachment`, `base64Of`, limits.
   - `use-command-suggestions.ts`: the palette query and its delay, `commandQuery`.
   - `composer-toolbar.tsx`: attachment button, model menu, effort, tool policy, send.
3. **`features/sessions/session-sidebar.tsx`** (625 lines; `SessionSidebar` ~143–454):
   - `project-group.tsx`: `ProjectGroup`.
   - `use-sidebar-filter.ts`: search and filter state.
   - `LoadMore`/`useLoadMore` stay unless a second file uses them.
4. **`features/conversation/use-conversation.ts`** (535 lines, 54 hooks):
   - `use-conversation-stream.ts`: attach, frames, reducer store.
   - `use-conversation-commands.ts`: send, abort, answer, branch, tool toggles.
   - `use-conversation.ts` composes both and keeps its public return type unchanged.
   - Revisit its two disables (~219, ~245) as in item 1.
5. **`lib/cn.ts` and `lib/utils.ts`**: if `utils.ts` only re-exports or duplicates `cn`
   (shadcn's default), point shadcn's `components.json` alias at `lib/cn` and delete
   `utils.ts`. Otherwise leave both and note why in "Noticed while working".

## Don't

- Don't rename exports, change props, or "improve" logic while moving it.
- Don't split `settings/general/setting-controls.tsx`, `provider-sign-in.tsx` or the
  `settings/mcp` folder in this step; open a `docs/tasks/` file for each if still wanted.

## Done when

- `bun run check` passes; report the duration.
- Full `bun run test:e2e` passes; report the duration.
- `bun run bench` budgets are no worse than before this step (bundle size may not grow).
- The memo proof from item 1.
- `bun run parity <old file> <new files…>` for each split, with the old file taken from
  the step's starting commit (`git show <sha>:<path> > .sandbox/…`), shows no lost classes
  or copy.

## Stop and ask when

- A split needs a behaviour change to compile.
