# 08 Settings panes

Make the eight settings sections follow the same patterns. Evidence and screenshots:
[findings.md → Settings](findings.md#settings).

Two page shapes stay as they are: **form page** (General, Diagnostics, Projects) and
**list + detail** (Providers, MCP, Context, Skills, Packages).

## Do

1. **List pane footer slot.** `features/settings/shell/list-pane.tsx` (moved in step 07)
   gets `footer={{ primary: ReactNode, more?: ReactNode }}`: one full-width `outline`
   button, and an optional `…` menu beside it. Each list pane uses it:

   | Pane      | Primary                                                                            | In the `…` menu                         |
   | --------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
   | Providers | Add provider (keep its "with an API key / account" choice as a menu on the button) | —                                       |
   | MCP       | Add MCP server                                                                     | Auto-enable codemode (a checkable item) |
   | Skills    | Add skill                                                                          | Import…                                 |
   | Packages  | Install package                                                                    | —                                       |
   | Context   | —                                                                                  | —                                       |

   If MCP's codemode switch reads better on the General page, stop and ask; do not move
   it without a yes.

2. **Empty states** use `EmptyState` (step 07) with VO-7 words:
   "No providers yet", "No MCP servers yet", "No skills yet", "No packages yet",
   "No projects yet", "No running engines", "No crashes", "No terminal-only calls".
   On the form pages the bordered card version goes. The empty list's action is the same
   as the footer's primary (do not add a second button with different words).
3. **Empty detail pane** (`detail-empty`): when the list has no items, the detail column
   is blank. "Select a {thing}" only when there is something to select. Fix the wording
   to one form: "Select a provider", "Select a server", "Select a skill", "Select a
   package", "Select a section" (Context).
4. **Info boxes in a list pane** (Skills, Context): at most one line in the pane. The
   rest moves to a `?` tooltip button beside the pane title, or to the detail page. New
   texts:
   - Skills: "Skills from extensions appear while a chat is open." (tooltip, not box)
   - Context: "Open a chat here to see the exact prompt and tools." (tooltip, not box)
5. **Context list.** A section with nothing in it keeps the normal title colour; only its
   second line is muted. The header count shows items, not sections; if that is not
   available, drop the count for Context.
6. **Form page alignment.** In General, Diagnostics and Projects the `PaneBar` title
   starts at the column gutter (x≈288 at 1440 px) while the content column is centred
   (x≈432). Put the bar's title inside the same `max-w-content mx-auto` column as the
   content, so they share one left edge.
7. **Projects' action.** "Open folder" stays in the bar (a form page has no footer). Its
   empty state's action is the same button; remove "Open one above".
8. **General page details**:
   - `general.tsx` ~139: "1 models can run a turn." → computed plural (VO-6).
   - "Automatic compaction / Enable automatic compaction.": delete the description, and
     the "Enabled" label beside every switch (VO-5). Search `setting-controls.tsx` for
     where the label is drawn.

## Don't

- Don't change what a setting does, its key, or its validation.
- Don't add a section or merge two.

## Done when

- `bun run shoot` of all eight sections empty, plus Providers with the stub provider
  selected, plus MCP with the `…` menu open, read by you, light.
- The settings e2e specs (`controls`, `onboarding`, `projects`, `skills-import`) pass,
  updated for the new words; report durations.
- `bun run check` passes.

## Stop and ask when

- A pane needs a second primary action.
- Moving a control (codemode) out of its pane.
