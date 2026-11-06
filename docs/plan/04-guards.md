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
3. **Screenshots use iris and playwright-cli; nobody writes a screenshot script.** (Owner,
   2026-11-06.) Two tools are installed on the owner's machine:
   - **iris** v0.4.1 (`/Users/maryln/.cargo/bin/iris`, from `cargo install
     iris-screenshot --version 0.4.1 --locked`; not on `PATH`). A Rust CLI that captures a
     URL through the installed Chrome. Flags: `-o <file|dir>`, `--size desktop` (1440×900
     @2x), `--full`, `--selector <css>`, `--wait <ms>`, `--wait-for <css>`, `--dark`,
     `--json`, `--timeout <s>`. It is also registered as an MCP server for the **pi** coding
     agent (`pi mcp add iris -- /Users/maryln/.cargo/bin/iris mcp`, global; tool
     `capture`). It is not installed for Claude.
   - **playwright-cli** (`/opt/homebrew/bin/playwright-cli`), with its skill at
     `~/.agents/skills/playwright-cli/SKILL.md` (pi reads `~/.agents/skills`). For states a
     URL cannot reach: open a dialog, a menu, hover, type, stop the server.

   Build **`scripts/shoot.ts`**, run as `bun run shoot <route…> [--out dir]`, as a thin
   launcher around iris:
   - Starts the built server on a scratch home with the stub model (reuse `launchEpsilon`
     from `test/e2e/app.ts` and `startStubModel`/`writeStubModels` from
     `test/e2e/stub-model.ts`). Never the real `~/.pi`.
   - Finds iris with `Bun.which("iris")`, else `~/.cargo/bin/iris`; if neither exists, it
     exits with "install iris: cargo install iris-screenshot --version 0.4.1 --locked".
   - Runs one iris batch: every route as `<server url><route>`, `--size desktop`,
     `--wait-for <ready selector>`, `--wait 400` (entrances settle), `--json`,
     `-o .sandbox/shots/<date>/` by default. It prints iris's JSON lines and exits non-zero
     if any line's `status` is not `ok`.
   - **Ready selector.** iris loads each URL fresh, and a fresh load first shows the
     connection strip and "Reading…" states. Add one attribute in the app that is true only
     when the socket is connected and no pane is loading, e.g. `data-ready` on the app
     root set from `useAppHealth()` (`src/app/core/status.tsx`) and the router's pending
     state. Name it in `docs/rules/testing.md`. This is the only app change in this step.
   - Stops the server and the stub on every path, under a 45 s deadline.
   - Interactive states are **not** flags of `shoot`. Steps 06–09 that need a dialog, a
     menu or a stopped server use playwright-cli against `bun run start` on a scratch home
     (`EPSILON_AGENT_HOME`), following the skill.

   Rules to add to `docs/rules/testing.md` (new `TS-n` IDs, Enforced by: review):
   - Screenshot a route with `bun run shoot`; capture an interactive state with
     playwright-cli. **Never write a one-off Playwright, Puppeteer or Chrome script for a
     screenshot or a quick look.**
   - For a quick inspection (what is on the page, a console error, a DOM value), use the
     playwright-cli skill: read `~/.agents/skills/playwright-cli/SKILL.md`, then use
     `playwright-cli open/goto/snapshot/click/screenshot/close`. Close its browser when done.
   - The pi agent may use the iris MCP `capture` tool against a server it started on a
     scratch home; the same never-the-real-home rule applies.
   - A screenshot is read by the agent that took it before it reports.
     Add a one-line pointer to these rules in `src/app/AGENTS.md` (replacing "from step 04").

4. **Clean `.sandbox/`** of the one-off scripts this replaces: `shot*.ts`, `*-shot.ts`,
   `*-probe.ts`, `probe*.ts`, `*-probe2.ts`, `shoot*.ts` at its top level. Delete them by
   name; do **not** run `bun run sandbox:clean` (it removes the dev agent home too). List
   what you deleted in the report.
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
- `bun run shoot /settings/general /settings/mcp` writes two PNGs in under 20 s that show
  loaded pages (no strip, no "Reading…"), you read both, and no process is left on its
  port.
- With playwright-cli, open Settings → MCP servers → Add MCP server on a scratch server and
  take one screenshot; read it; close the browser and stop the server.
- `bun run check` passes; report its duration.

## Stop and ask when

- A disable cannot be removed and its reason is unclear.
