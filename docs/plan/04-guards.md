# 04 Guards: doc check, disable policy, screenshot tool

Tools that make the docs and the UI checkable, so later steps prove their work instead of
describing it.

## Do

1. **`scripts/doc-check.ts`**, run as `bun run doc-check`, added to `bun run check`.
   It reads `AGENTS.md`, every folder `AGENTS.md`, `DESIGN.md` (if present) and `docs/**`
   except `docs/plan/`. It ignores paths that contain `<` or `*` (placeholders and globs),
   prints each failure as `file:line: what`, and has a test beside it with one passing and
   one failing fixture. It fails on:
   - a relative link or a backticked path (`src/…`, `docs/…`, `scripts/…`, `test/…`,
     `tools/…`) that does not exist;
   - a `bun run <name>` whose `<name>` is not a script in `package.json`;
   - a rule ID (`FB-3`, `VO-2`, …) cited anywhere that is not defined in a heading;
   - a file over its size limit (`docs/README.md`, doc rule 3).
2. **Disable policy** in `tools/oxlint/`:
   - Every `oxlint-disable…` comment must carry `-- <reason>`. Find whether oxlint already
     enforces this with an option; if not, add a rule `epsilon/disable-reason`.
   - `epsilon/design-tokens` and `epsilon/feedback-surfaces` cannot be disabled outside
     `src/app/components/ui/` and `components/editor/`.
   - `@ts-expect-error`, `@ts-ignore` and `as unknown as` are errors outside
     `src/backend/platform/` and `test/`.
   - Fix the three disables that have no reason today (see [findings.md](findings.md#code-smells))
     by adding the reason, or by removing the disable when the code can be written without it.
   - Each lint message names its rule ID in the new docs (`see docs/rules/feedback.md FB-1`).
3. **`scripts/shoot.ts`**, run as `bun run shoot <route…> [--out dir]`.
   - Starts the built server on a scratch home with the stub model (reuse
     `launchEpsilon` from `test/e2e/app.ts` and `startStubModel`/`writeStubModels` from
     `test/e2e/stub-model.ts`), launches the repo's Playwright Chromium at 1440×900, light.
   - Opens the first route with `page.goto` and the rest **by clicking in-app links**, so
     the socket is not reconnected between shots. A full page load per route captured the
     "Reconnecting" strip and blank pages in this plan's audit.
   - Before each shot it waits until no text matches `Reading|Loading|Connecting` and every
     finite animation has finished (`document.getAnimations()`).
   - A 45 s watchdog, `setDefaultTimeout(8000)`, and stopping the browser, the server and
     the stub on every path. Defaults to `.sandbox/shots/<date>/`.
   - Named states, so a step can ask for one: `--state mcp-add` opens Add MCP server;
     `--state server-down` stops the server and waits for the strip. Add only the states
     steps 06–09 name.
   - Document it in `docs/rules/testing.md` as the one screenshot tool, and add a rule:
     a one-off screenshot script in `.sandbox/` is only for a state `shoot` cannot reach.
4. **Clean `.sandbox/`** of the one-off probes this replaces (`shot*.ts`, `*-shot.ts`,
   `*-probe.ts`). `.sandbox/` is git-ignored scratch, so this is `bun run sandbox:clean`
   or a manual delete. List what you deleted in the report.
5. **Budgets**: run `bun run test` three times and report the durations. If the median is
   over the 10 s budget in `docs/rules/testing.md`, do not raise it: open
   `docs/tasks/test-suite-budget.md` with the three numbers.

## Don't

- Don't make `doc-check` read `archive/` or `docs/plan/`.
- Don't let `shoot` read or write the real `~/.pi`.

## Done when

- `bun run doc-check` passes on the docs from steps 01–03, and its test fails without the
  fix it covers.
- `bun run lint` passes with zero disables without a reason.
- `bun run shoot /settings/general /settings/mcp --state mcp-add` writes three PNGs in under
  20 s, and no process is left on its port.
- `bun run check` passes; report its duration.

## Stop and ask when

- A disable cannot be removed and its reason is unclear.
