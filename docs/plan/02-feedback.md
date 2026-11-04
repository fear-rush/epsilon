# Phase 2: Feedback system

The one visible change from `main`. `main` shows errors, warnings, waits and empty states
in several inconsistent ways; this phase gives each one exactly one surface, before any
screen is ported, so each screen is ported once, straight onto it.

## Surfaces

Choose by the scope of what the message is about. A feature never invents its own.

| Scope                             | Surface                                                                                                                                                                             | Examples                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| The whole app                     | the status line: `AppStatus`, fed by `useReportStatus` (`app/core/status.tsx` after phase 1)                                                                                        | server unreachable, page out of date, no model ready, a chat that cannot continue |
| A route crashed or does not exist | `RouteError`, `RouteNotFound` on `StatusView`, **inside** the app shell: `errorComponent`/`notFoundComponent` on the `_app` and `settings` layouts; the root one is the last resort | a render throws, an unknown session id                                            |
| A pane's own read                 | `StatusView`: loading, empty, failed, not found                                                                                                                                     | the provider list failed to read, no skills yet                                   |
| A section, form or card           | `Notice` at the top of what it is about                                                                                                                                             | save refused, pi could not parse `settings.json`, a project overrides this server |
| Beside one control                | `InlineStatus`                                                                                                                                                                      | Saved, Checking…, connection test failed                                          |
| One field                         | shadcn `FieldError` under the field                                                                                                                                                 | "Use a whole number."                                                             |
| A chat turn                       | the transcript's error entry and `RunStatus`                                                                                                                                        | the model refused, retrying in 4 s, compaction failed                             |
| Before a destructive action       | `confirm-dialogs` (`AlertDialog`), `variant="destructive"`                                                                                                                          | delete a chat, remove a provider                                                  |

## Rules

- **One tone vocabulary**: `Tone = "neutral" | "info" | "success" | "warning" | "danger"`
  in `status-tone.ts`, taken by `StatusView`, `Notice`, `InlineStatus` and the status line.
  `main`'s three (`muted|destructive|warning`, `error|warning|success|info`,
  `warning|destructive|info`) are gone.
- **One translator**: `errorView(error)` returns `{ tone, title, line, icon }` and
  switches exhaustively on the protocol's tagged errors, so a new tag does not type-check
  until it has words. `StatusView` and `Notice` take `error={…}` and call it. Features never
  render `error.message`.
- **No toasts.** A message that disappears is a failure nobody saw (AGENTS.md invariant
  10). Success is the changed UI; where the change is not visible, the form shows
  `InlineStatus` "Saved".
- **Spinners**: a waiting pane or section shows `LoadingState`. A bare `Spinner` lives
  only inside a pending `Button`.
- **Words**:
  - The title says what did not happen: "Couldn't save the provider", "Couldn't read MCP
    servers". Not "Error", not "Failed:", no exclamation marks.
  - Something missing: "Session not found".
  - The line gives the reason in pi's words when there is one, then what to do.
  - No stack traces, error tags or JSON in the UI; they go to the log and Diagnostics.
- **Colour only through the surfaces.** Files under `app/features/` and `app/routes/`
  do not import `@/components/ui/alert` and do not write `text-destructive`,
  `text-warning`, `text-success`, `text-info` or their `bg-`/`border-` forms.

## Items

- [x] `status-tone.ts`: the one `Tone`. `StatusView`, `Notice`, `InlineStatus`, the status
      line and `AppBanner` (if still used) take it.
- [x] `errorView`: exhaustive over the protocol's tagged errors, with the words above;
      `StatusView` and `Notice` accept `error`.
- [x] `RouteError`, `RouteNotFound`, `RoutePending` on `StatusView`, mounted per layout
      inside the shell.
- [x] `epsilon/feedback-surfaces` in `tools/oxlint/epsilon/rules/`, with tests in
      `tools/oxlint/epsilon/rules.test.ts`, enforcing the colour and import rule.
- [x] Move every existing feature on the branch onto the surfaces until the new rule
      passes.
- [ ] Move the "Surfaces" and "Rules" sections into ARCHITECTURE.md's UI rules, and leave
      a link here.

`main` files that break these rules, to port straight onto the system in phase 3:
`app/route-error.tsx` (raw `Alert`, full page);
`settings/mcp/{mcp-add-values,mcp-registry-browser,mcp-add-source,mcp-registry-values,mcp-signin}.tsx`;
`settings/providers/provider-sign-in.tsx`;
`settings/general/{setting-controls,settings-form}.tsx`; `settings/skills/skill-card.tsx`;
`components/editor/code-editor/code-editor.tsx`; and `main`'s 37 bare `Spinner`s.
`features/app-shell/app-health-banner.tsx` is replaced by the status line; its ledger row
is ticked as "replaced by `AppStatus`".

## Done when

- [x] The lint rule is on at error and `bun run check` is green.
- [ ] Screenshots, light and dark: a route that throws (sidebar still visible), an
      unknown session id, the server stopped (status line), a refused save (`Notice`), a
      field error. Not taken: AGENTS.md allows browser checks only when the owner asks.
- [x] `git grep -n 'error.message' -- src/app/features src/app/routes` finds nothing.
