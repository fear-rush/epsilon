# Phase 2: Feedback system

The one visible change from `main`. `main` shows errors, warnings, waits and empty states
in several inconsistent ways; this phase gives each one exactly one surface, before any
screen is ported, so each screen is ported once, straight onto it.

## Surfaces and rules

They live in [ARCHITECTURE.md, Feedback surfaces](../ARCHITECTURE.md#feedback-surfaces):
the scope → surface table, the one tone vocabulary, the translator, and the no-toast,
spinner and colour rules.

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
- [x] Move the "Surfaces" and "Rules" sections into ARCHITECTURE.md's UI rules, and leave
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
- [x] `git grep -n 'error.message' -- src/app/features src/app/routes` finds nothing. The
      check passed when phase 2 landed; later slices (S4, S5) reintroduced raw-message
      sites, and [04-safety.md](04-safety.md) carries the item that finishes them.
