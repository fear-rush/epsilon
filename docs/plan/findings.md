# Findings

The evidence behind the plan, from the 2026-11-06 review at `1b0a4b0`. Counts marked ≈
came from grep and are approximate. Line numbers drift: search before you edit.

Screenshots from the review (light, 1440×900, scratch home with the stub model) were
taken outside the repository and are not kept; `bun run shoot` (step 04) reproduces them.

## Feedback

- `components/ui/alert.tsx`: `destructive` and `success` are `bg-card` with coloured text;
  `info` and `warning` are tinted (`border-{tone}/40 bg-{tone}/10`). Same component, two
  looks. The red "engine not responding" banner and the yellow drift banner in the owner's
  screenshots are these two looks side by side.
- `features/conversation/session-view.tsx` ~306 `ChatNotices`: `px-page`, `border-t`, no max
  width, so it spans the whole pane while the composer and `RunStatus` stop at `max-w-4xl`.
  It passes the notice text as `title` (medium weight).
- `features/conversation/run-status.tsx`: five copies of
  `rounded-xl border bg-background px-3 py-2`; bare `Spinner` at ~104 and ~113.
- Epsilon notice text written on the server, bypassing the client translator:
  `src/backend/conversation/supervisor.ts` ~106, ~168, ~198 ("This chat's engine is not
  responding and is being restarted."), ~208; `registry.ts` ~205; `src/engine/session.ts`
  ~1550 (drift). `docs/effect.md` already said "message text lives in the client's
  `errorView`"; notices were the loophole.
- Drift can show twice: `RunStatus`'s row with Reload (~95) and the engine's notice.
- `components/patterns/status/error-view.ts` ~57 "This page met a problem it cannot
  explain…", ~82 "This page reconnects on its own."
- `core/status.tsx` ~140 has its own tone map for the `Strip`, separate from `Notice`'s.
- A fresh page load showed "Reconnecting to the server…" before any connection had
  succeeded (seen once in a screenshot; not yet confirmed in code).
- Owner's screenshot: a centred "Server not reachable" `StatusView` and the strip can
  describe the same lost connection.

## Styling

- Feature code follows the type roles: `text-meta` ≈117, `text-body` ≈41; no `text-xs` or
  `text-sm` outside `components/ui/` (≈68 inside).
- Radius has no lint: `rounded-md` ≈25, `rounded-xl` ≈23, `rounded-full` ≈8,
  `rounded-lg` ≈7 in features, patterns and ai-elements. ARCHITECTURE documented a ladder
  that nothing checked.
- Icons: `size-4` ≈24, `size-3.5` ≈4, `size-6` ≈4, `size-2` 1; not checked.
- Arbitrary values are confined to `components/ui/` and `editor/` (≈15), exempt from lint.
  Raw colours: `ui/bubble.tsx` ~30 (oklch from `--primary`), `typeset.css` ~127 (mark
  highlight). Overlays use `bg-black/30` in `ui/dialog`, `alert-dialog`, `sheet`.
- Unused: `--chart-1..5`; likely unused `--radius-3xl/4xl`.
- `design-tokens` lint (`tools/oxlint/epsilon/rules/design-tokens.ts`) checks brackets,
  raw palette colours, `text-xs…9xl`, and spacing steps `0, 0.5, 1, 1.5, 2, 3, 4, 6, 8`.
  It does not check radius, icon size, shadows, durations or z-index.

## Motion

- Tokens: `--ease-settle`, five `enter-*`, `duration-fast/base/slow` (150/220/360 ms).
- ≈63% of `duration-*` uses bypass them: `duration-150` ≈14, `duration-200` ≈8,
  `duration-100` 2, `duration-300` 1, `duration-400` 1. Mostly shadcn overlays.
- `motion.css`: raw 200 ms, 280 ms, the settle curve written out, and an overshoot
  `cubic-bezier(0.34, 1.56, 0.64, 1)`. `transition-panel` hardcodes 200 ms.
- `transition-all` ≈9 (e.g. `ui/progress.tsx` ~38, `transcript.tsx` ~162,
  `session-sidebar.tsx` ~601).
- Reduced motion: a global rule stops animations (freezing spinners); JS smooth scrolling
  in `transcript.tsx` (~136–153, ~321, ~431) ignores the preference.
- Banners above the composer appear without an entrance.
- Focus rings: `ring-3` ≈16, `ring-2` 5, `ring-[3px]` 3, opacities /20…/50.

## Structure

- `components/patterns/scope-tabs.tsx` ~21–23 and `components/patterns/list/list-pane.tsx`
  ~14 import from `@/features/*`. Nothing forbids it.
- Chat-specific components live in `components/ui/` (`message`, `bubble`, `marker`,
  `trace`, `attachment`, `message-scroller`). Left alone by this plan.
- Large single functions: `Composer` ≈570 lines; `Transcript` ≈340 (22 hooks);
  `SessionSidebar` ≈310; `use-conversation` 54 hook calls.
- Transcript rows (`Row`, `AssistantRow`, `StreamingRow`) are not memoized; below 150
  entries every streamed token re-renders every row.
- `lib/cn.ts` and `lib/utils.ts` overlap.

## Code smells

- ≈9 `oxlint-disable` comments outside generated files; without a reason:
  `transcript.tsx` ~362, `provider-sign-in.tsx` ~276, `provider-models.tsx` ~282.
- No `any` outside `routeTree.gen.ts`.

## Settings

Two page shapes: form (General, Diagnostics, Projects) and list + detail (Providers, MCP,
Context, Skills, Packages).

- **Cancel is red**: `variant="destructive"` on Cancel in ≈13 settings files (e.g.
  `mcp-add-dialog.tsx` ~171, `provider-import-dialog.tsx` ~76, `provider-model-dialog.tsx`
  ~137, `provider-sign-in.tsx` ~214). Inherited from `main` (19 there).
- **List pane footers differ**: Providers full-width split button; MCP full-width outline
  plus a global "Auto-enable codemode" switch in the footer; Skills "Import" (outline) next
  to "Add skill" (ghost); Packages full-width outline; Projects' action is in the bar.
- **Empty states differ**: "No MCP server configured yet." / "No skill yet." /
  "No packages installed" / "No projects yet" (card) / "No engine is running" /
  "No provider configured yet." List panes use a centred icon; form pages a bordered card.
- The detail pane says "Select an MCP server" when there are none.
- Skills and Context show multi-line blue info boxes inside the 20 rem list pane.
- Context: empty sections look disabled (muted title); its header count "7" counts
  sections.
- Form pages: bar title at x≈288, content column at x≈432 (1440 px wide).
- `general.tsx` ~139 "1 models can run a turn." (from `main`).
- "Automatic compaction / Enable automatic compaction." and an "Enabled" label beside the
  switch.
- MCP "Add MCP server" dialog: fixed `dialog-body-lg` height around one bare spinner.

## Copy

≈46 strings of 70+ characters in `src/app`, `src/backend`, `src/engine` explain internals
or repeat their label. Examples are in [09-copy.md](09-copy.md). The composer placeholder
is "Message the agent (/ commands, ! shell, Enter sends, paste or drop images)".

## Docs and agent context

- `AGENTS.md` 161 lines, loaded every session; its routing table is repeated in
  `docs/README.md`.
- `DECISIONS.md` 753 lines with no index; `pi-sdk.md` 1043 lines.
- `NEXT.md` broke its own template: a build log, ticked prose, a "Done, for the record"
  section, a list folded into a paragraph by the formatter.
- Rules documented but not enforced, each broken in code: the radius ladder; "message text
  lives in `errorView`"; bare `Spinner` only in a `Button`; `patterns/` imports no feature;
  `components/ui` is shadcn source.
- Claude memory contradicted the repository (OpenAPI REST client, main-only branches,
  `.sandbox/refactor/`, `docs/PARITY.md`, `shared/src/…`).
- `.sandbox/` holds ≈30 one-off screenshot and probe scripts, rewritten per task because
  the repository has no screenshot tool.
- Suite budget 10 s; recent runs 10.3 s and 11.1 s.
