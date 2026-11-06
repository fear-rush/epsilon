# 05 DESIGN.md and the token generator

`DESIGN.md` becomes the only source of design tokens. This step changes **no rendered
pixel**: the generated tokens equal today's values. The visible changes come in 06–09.

Format: [design.md](https://github.com/google-labs-code/design.md) (alpha). YAML front
matter holds the tokens; the markdown body says when to use them. Body sections in this
order: Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's
and Don'ts. Extra sections allowed after them: Motion, Feedback, Voice. Light only (D4).

## Do

1. **Front matter tokens.** Copy values, never invent them.

   | Group        | Source                                 | Keys                                                                                                                                                                                                                                       |
   | ------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | `colors`     | `src/app/index.css` `:root` (oklch)    | every `--*` colour in `:root` except `chart-*` (unused); keep shadcn's names: `background`, `foreground`, `primary`, `muted`, `muted-foreground`, `border`, `destructive`, `warning`, `success`, `info`, their `-foreground`s, `sidebar-*` |
   | `typography` | `src/app/styles/tokens.css` `--text-*` | `display`, `title`, `section`, `body`, `meta`, `code`                                                                                                                                                                                      |
   | `rounded`    | `index.css` `--radius` ladder          | today's `sm`…`2xl` values as computed rem, plus the **role** names (step 07 uses them): `chip` = md, `control` = lg, `card` = xl, `bubble` = 2xl, `pill` = 9999px                                                                          |
   | `spacing`    | `tokens.css` `--spacing-*`             | `bar`, `band`, `nav`, `list`, `pane`, `page`, `row`, `field`, `card`, `section`, `dialog-body-*`                                                                                                                                           |
   | `motion`     | `tokens.css` (extension group)         | `ease-settle`, `duration-fast` 150ms, `duration-base` 220ms, `duration-slow` 360ms                                                                                                                                                         |

   The radius ladder in today's ARCHITECTURE ("rounded-md rows and chips, rounded-lg
   controls, menus and code, rounded-xl dialogs, panels and bordered lists, rounded-2xl
   bubbles, rounded-full pills") is the role mapping above.

2. **Components** (front matter `components:` + one `###` each in the body). Name the
   components Epsilon has; each body entry says what it is for, its tokens, its states,
   and one **Don't**. Write the **target** (D5):

   | Component                                                                                         | Target notes                                                                                               |
   | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
   | `pane-bar`                                                                                        | `h-bar`; every column starts with one; title and content share the column's left edge.                     |
   | `list-pane`                                                                                       | `w-list`; search, rows, **footer slot: one main button (outline, full width) + optional overflow menu**.   |
   | `list-row`                                                                                        | `pad-item`, `rounded.chip`; hover `muted`; selected `muted` + medium weight.                               |
   | `form-card`, `form-row`                                                                           | the General page's card: `rounded.card`, rows divided by `border`, label + one-line description + control. |
   | `empty-state`                                                                                     | icon + "No {plural} yet" (no period) + optional action. One component for list panes and form pages.       |
   | `detail-empty`                                                                                    | "Select a {thing}" only when the list has items; blank when it has none.                                   |
   | `status-view`                                                                                     | a pane's centred loading/empty/failed state.                                                               |
   | `notice-{neutral,info,success,warning,danger}`                                                    | **one look for all tones**: `border-{tone}/30`, `bg-{tone}/5`, tone icon, body in `foreground`.            |
   | `status-strip`                                                                                    | the app-wide line above every surface; same tone map as `notice`.                                          |
   | `status-row`                                                                                      | one bordered row above the composer: icon or spinner, text, optional action; `max-w-content`.              |
   | `inline-status`                                                                                   | a status beside a control.                                                                                 |
   | `dialog-{sm,md,lg}`                                                                               | width by size; body **min-height** by size, max-height `80vh`, scrolls inside past it.                     |
   | `button-{default,outline,ghost,destructive}`                                                      | destructive **only** for an action that deletes or stops; **Cancel is `outline`**.                         |
   | `composer`, `message-user`, `message-agent`, `run-card`, `thought-row`, `jump-rail`, `code-block` | as the chat draws them today; describe, don't redesign.                                                    |

   Also add here the "looks" decisions step 03 parked in `docs/plan/README.md`.

3. **Body sections.**
   - **Overview**: a quiet tool for one person running an agent; surfaces rest white;
     colour only means state (running, needs input, failed, selected); dense, never
     cramped.
   - **Layout**: the spacing roles and when each applies. **Layout (width, height, grid,
     flex placement) is free and never linted.**
   - **Elevation**: borders, not shadows, except overlays (dialog, menu, popover).
   - **Motion**: one curve, three durations, the five `enter-*` entrances; the overlay
     primitives in `components/ui` move to these tokens in step 07; reduced motion stops
     every non-essential animation, but a spinner keeps turning.
   - **Feedback**: link `docs/rules/feedback.md`; list the components above by scope.
   - **Voice** (the copy rules, IDs `VO-n`):
     - VO-1 A title is 2–5 words and says what happened or what is happening.
     - VO-2 A second line is optional, one sentence, and only says what to do.
     - VO-3 Never explain internals: no "on its own", "cannot explain", "registry",
       "supervisor", "evicts", "terminal-only", "engine" unless the user picks one.
     - VO-4 A button beats a sentence: ✗ "Reload to get the version that matches" ✓ `[Reload]`.
     - VO-5 A description that repeats its label is deleted; a switch needs no "Enabled".
     - VO-6 Plurals are computed: ✗ "1 models" ✓ "1 model".
     - VO-7 Empty states: "No {plural} yet", no period.
   - **Do's and Don'ts**, and the three rule levels (D6), with how to add a role: add the
     token to the front matter, regenerate, describe it in one line, same commit.

4. **Generator** `scripts/design.ts`, run as `bun run design` (write) and
   `bun run design --check` (fail if the output would change).
   - Reads the front matter with the `yaml` package if it is already a dependency (check
     `package.json`); otherwise stop and ask before adding one.
   - Writes `src/app/styles/tokens.gen.css` with a header comment
     `/* Generated from DESIGN.md by bun run design. Do not edit. */`:
     the `:root` colour variables, and an `@theme` block for text, radius (including the
     role names), spacing and motion variables.
   - Remove the generated parts by hand from `index.css` (`:root` colours only; `.dark`
     stays, D4) and `tokens.css` (the `@theme` variables only; keyframes, `@utility`
     presets and comments stay). Import `tokens.gen.css` from `index.css` where the
     `:root` block was.
   - Add `tokens.gen.css` to invariant 12 in `AGENTS.md` (never edit generated files) and
     to `.oxfmt` ignore if the formatter would rewrite it.
   - Add `bun run design --check` to `bun run check`.
5. **Lint the file** with Google's CLI, pinned: `bunx @google/design.md@<exact version> lint
   DESIGN.md`. Record the version in `docs/rules/testing.md`. The `motion` group is an
   unknown key; that warning is expected and listed in the rule. Errors (broken token
   references) must be zero. Add it to `bun run check` only if it runs offline from the
   lockfile; otherwise stop and ask.

## Don't

- Don't change a token's value in this step, even one D5 says is wrong.
- Don't model dark mode (D4).
- Don't describe a component that does not exist; list a missing one under "Noticed while
  working".

## Done when

- `bun run design --check` passes, and `git diff` of the built CSS is empty: run
  `bun run build` before and after the change and compare `dist/app/assets/*.css` after
  sorting declarations. A difference is a bug in this step.
- The design.md lint reports 0 errors.
- `bun run check` passes; report the suite duration.
- One `bun run shoot` of `/settings/general`
  and one chat looks identical to before.

## Stop and ask when

- A token in the CSS has no clear role, or two roles share one value in a way the radius
  mapping above does not cover.
