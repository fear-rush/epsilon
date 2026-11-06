---
version: alpha
name: Epsilon
description: A quiet dashboard for one person running a coding agent.
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0 0)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.145 0 0)"
  popover: "oklch(1 0 0)"
  popover-foreground: "oklch(0.145 0 0)"
  primary: "oklch(0.205 0 0)"
  primary-foreground: "oklch(0.985 0 0)"
  secondary: "oklch(0.97 0 0)"
  secondary-foreground: "oklch(0.205 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "oklch(0.556 0 0)"
  accent: "oklch(0.97 0 0)"
  accent-foreground: "oklch(0.205 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  warning: "oklch(0.795 0.184 86.047)"
  warning-foreground: "oklch(0.216 0.006 56.043)"
  success: "oklch(0.627 0.194 149.214)"
  success-foreground: "oklch(0.985 0 0)"
  info: "oklch(0.546 0.245 262.881)"
  info-foreground: "oklch(0.985 0 0)"
  border: "oklch(0.922 0 0)"
  input: "oklch(0.885 0 0)"
  ring: "oklch(0.708 0 0)"
  sidebar: "oklch(1 0 0)"
  sidebar-foreground: "oklch(0.145 0 0)"
  sidebar-primary: "oklch(0.205 0 0)"
  sidebar-primary-foreground: "oklch(0.985 0 0)"
  sidebar-accent: "oklch(0.97 0 0)"
  sidebar-accent-foreground: "oklch(0.205 0 0)"
  sidebar-border: "oklch(0.922 0 0)"
  sidebar-ring: "oklch(0.708 0 0)"
typography:
  display:
    fontSize: 1.5rem
    lineHeight: 1.25
    fontWeight: 600
    letterSpacing: -0.015em
  title:
    fontSize: 0.9375rem
    lineHeight: 1.4
    fontWeight: 600
  section:
    fontSize: 0.875rem
    lineHeight: 1.4
    fontWeight: 500
  body:
    fontSize: 0.875rem
    lineHeight: 1.5
  meta:
    fontSize: 0.75rem
    lineHeight: 1.4
  code:
    fontSize: 0.75rem
    lineHeight: 1.5
rounded:
  sm: 0.375rem
  md: 0.5rem
  lg: 0.625rem
  xl: 0.875rem
  2xl: 1.125rem
  3xl: 1.375rem
  4xl: 1.625rem
  chip: 0.5rem
  control: 0.625rem
  card: 0.875rem
  bubble: 1.125rem
  pill: 9999px
spacing:
  bar: 3rem
  band: 3.5rem
  nav: 16rem
  list: 20rem
  pane: 0.75rem
  page: 2rem
  row: 0.25rem
  field: 0.75rem
  card: 1.5rem
  section: 2rem
  dialog-body-sm: 16rem
  dialog-body-md: 24rem
  dialog-body-lg: 36rem
  icon-sm: 0.875rem
  icon: 1rem
  icon-lg: 1.5rem
containers:
  content: 56rem
  dialog-sm: 28rem
  dialog-md: 42rem
  dialog-lg: 56rem
motion:
  ease-settle: cubic-bezier(0.16, 1, 0.3, 1)
  ease-overshoot: cubic-bezier(0.34, 1.56, 0.64, 1)
  duration-fast: 150ms
  duration-base: 220ms
  duration-slow: 360ms
components:
  pane-bar:
    height: "{spacing.bar}"
    typography: "{typography.title}"
  list-pane:
    width: "{spacing.list}"
    padding: "{spacing.pane}"
  list-row:
    rounded: "{rounded.chip}"
    padding: 0.5rem
    backgroundColor: "{colors.background}"
  list-row-hover:
    backgroundColor: "{colors.muted}"
  list-row-selected:
    backgroundColor: "{colors.muted}"
    typography: "{typography.section}"
  form-card:
    rounded: "{rounded.card}"
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
  form-row:
    padding: 0.75rem 1rem
    typography: "{typography.body}"
  empty-state:
    textColor: "{colors.muted-foreground}"
    typography: "{typography.meta}"
  detail-empty:
    textColor: "{colors.muted-foreground}"
  status-view:
    textColor: "{colors.muted-foreground}"
  notice-neutral:
    rounded: "{rounded.control}"
    textColor: "{colors.foreground}"
  notice-info:
    rounded: "{rounded.control}"
    textColor: "{colors.foreground}"
  notice-success:
    rounded: "{rounded.control}"
    textColor: "{colors.foreground}"
  notice-warning:
    rounded: "{rounded.control}"
    textColor: "{colors.foreground}"
  notice-danger:
    rounded: "{rounded.control}"
    textColor: "{colors.foreground}"
  status-strip:
    textColor: "{colors.foreground}"
    typography: "{typography.meta}"
  status-row:
    rounded: "{rounded.control}"
    textColor: "{colors.foreground}"
  inline-status:
    typography: "{typography.meta}"
  dialog-sm:
    rounded: "{rounded.card}"
    width: 28rem
    height: "{spacing.dialog-body-sm}"
  dialog-md:
    rounded: "{rounded.card}"
    width: 42rem
    height: "{spacing.dialog-body-md}"
  dialog-lg:
    rounded: "{rounded.card}"
    width: 56rem
    height: "{spacing.dialog-body-lg}"
  button-default:
    rounded: "{rounded.control}"
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
  button-outline:
    rounded: "{rounded.control}"
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
  button-ghost:
    rounded: "{rounded.control}"
    textColor: "{colors.foreground}"
  button-destructive:
    rounded: "{rounded.control}"
    textColor: "{colors.destructive}"
  composer:
    rounded: "{rounded.card}"
    backgroundColor: "{colors.card}"
  message-user:
    rounded: "{rounded.bubble}"
    backgroundColor: "{colors.muted}"
  message-agent:
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
  run-card:
    rounded: "{rounded.card}"
    backgroundColor: "{colors.card}"
  thought-row:
    textColor: "{colors.muted-foreground}"
    typography: "{typography.meta}"
  jump-rail:
    width: "{spacing.page}"
  code-block:
    rounded: "{rounded.control}"
    typography: "{typography.code}"
---

# Epsilon design

The front matter above is the only source of design tokens. `bun run design` writes
`src/app/styles/tokens.gen.css` from it; never edit that file. Light only: the `.dark`
block in `src/app/index.css` is not modelled. `containers` and `motion` are extension
groups the Google linter lists as unknown keys.

## Overview

A quiet tool for one person running an agent. Surfaces rest white. Colour only means state
(running, needs input, failed, selected); a muted fill is a state. Dense, never cramped.
Rules constrain roles and meaning, never layout.

## Colors

The shadcn names are kept. `background` and `card` are the resting surface; `muted` is a
hover or selected fill; `muted-foreground` is secondary text; `border` divides, `input`
outlines a control, `ring` marks focus. `destructive`, `warning`, `success` and `info` are
the tones of [feedback](docs/rules/feedback.md), each with a `-foreground` where it fills.
`sidebar-*` colour the session column. Chart colours are unused and stay in `index.css`.

## Typography

Six roles; a page uses these, not raw sizes: `display` (a page's heading), `title` (a bar
or card title), `section` (a group heading), `body`, `meta` (counts, captions, hints) and
`code`.

## Layout

Spacing by role. Width, height, grid and flex placement are free and never linted.

- `bar`, `band`: the height of every column's top bar and of a tabs band, so the settings
  nav, a list and a detail page share one rule.
- `nav`, `list`: the width of the settings nav and of a list pane.
- `pane`: the horizontal gutter of a nav or list pane. `page`: of a detail page.
- `row`: the gap between rows in a list. `field`: between fields in a form. `card`:
  between cards in a section. `section`: between sections.
- `containers.content` is the widest a detail page's content grows (`max-w-content`).
- `dialog-body-sm` to `-lg` is a dialog body's steady height by size (a flex basis: it
  shrinks on a short window and scrolls inside); `containers.dialog-*` its width.
- `icon-sm`, `icon`, `icon-lg`: an icon's size (`size-icon`): 0.875rem inside dense text, 1rem
  by default, 1.5rem in a pane's centred state.
- One inset per column: a bar's title, search, a group heading and a row's text start on
  the column's gutter.
- The jump rail owns a narrow gutter at the pane's left edge as a sibling of the scroll
  area, never an overlay, so a wide tool result cannot run under it.

## Elevation & Depth

Borders, not shadows, except overlays (dialog, menu, popover).

## Shapes

One ladder by role: `chip` (rows and chips), `control` (controls, menus, code), `card`
(dialogs, panels, bordered lists), `bubble` (message bubbles only), `pill` (pills and
circular icon buttons). `sm` to `4xl` are the registry's steps behind them; a feature uses
the role names, and `rounded-none`. The lint rule enforces it outside `components/ui` and
`components/editor`. Radius follows `--radius`, which the sidebar overrides for its subtree.

## Components

Each entry says what it is for, its tokens, its states and one Don't. These describe the
target; where the code differs, the code is wrong.

### pane-bar

Starts every column: `h-bar`, title and content on the column's left edge; on a form page
the bar sits in the same `max-w-content` column as the content. A title and
count drop in from above, and again when their text changes.
Don't: start a column without one.

### list-pane

`w-list`: search, rows, then a footer slot holding one main button (outline, full width)
and an optional overflow menu. A session list pages by ten rows, a search shows all matches.
Don't: put a second main button in the footer.

### list-row

`rounded.chip`, padding 0.5rem; hover `muted`; selected `muted` with medium weight.
Don't: use colour other than `muted` for selection.

### form-card, form-row

The General page's card: `rounded.card`, rows divided by `border`, each a label, a one-line
description and a control.
Don't: repeat the label in the description.

### empty-state

Icon, "No {plural} yet" (no period) in `meta` size, and an optional action. One component
for list panes and form pages. Its action, when it has one, is the page's main button
(a list pane's footer already holds it, so the pane's empty state has none).
Don't: write a second empty look.

### detail-empty

"Select a {thing}", only when the list has items; blank when it has none.
Don't: show it beside an empty list.

### status-view

A pane's centred loading, empty or failed state.
Don't: use it for a state beside content.

### notice-neutral, notice-info, notice-success, notice-warning, notice-danger

One look for all tones: `border-{tone}/30`, `bg-{tone}/5`, the tone's icon, body in
`foreground`. See [feedback](docs/rules/feedback.md).
Don't: colour the body text by tone.

### status-strip

The app-wide line above every surface; the same tone map as a notice.
Don't: stack two strips.

### status-row

One bordered row above the composer: icon or spinner, text, optional action;
`max-w-content`.
Don't: show a spinner without words.

### inline-status

A status beside a control, in `meta`.
Don't: use it for a failure that needs an action; use a notice.

### dialog-sm, dialog-md, dialog-lg

Width by size; body min-height by size, max-height `80vh`, scrolls inside past it.
Content stays mounted while closed so the transitions play.
Don't: let a dialog resize between steps.

### focus

`ring-3 ring-ring/50`, no offset, on `:focus-visible` for every control: buttons, inputs,
sidebar menu buttons and any focusable row.
Don't: write another ring width, opacity or outline.

### button-default, button-outline, button-ghost, button-destructive

Destructive only for an action that deletes or stops, and it confirms in an `AlertDialog`.
Cancel is `outline`.
Don't: use `destructive` for emphasis.

### composer

The chat's input card. A chat's rows and the composer rise with `enter-rise`.
Don't: name the folder anywhere else in the chat's header.

### message-user, message-agent

The user's turn is a `bubble`; the agent's reply is plain text on the surface. External
Markdown links in a reply are inline citations: the chip names the host, the card names the
page and carries the link, and the same links are listed under Sources. A relative or hash
link stays an ordinary link.
Don't: put a bubble round an agent reply.

### run-card

Consecutive assistant messages that only called tools are one row, with a header that
names the work ("Ran 8 steps · 8 commands · 1 failed") and one line per step. It opens
while it works and when a step failed, and closes once the answer starts. A run of one
step is the step's own line with no header.
Don't: draw a heading per message.

### thought-row

One component draws every thought, labelled, quoting its first line and opening into the
whole of it.
Don't: draw a second shape for a thought above an answer.

### jump-rail

Dots for the active branch's user turns, in its own gutter (see Layout). A dot grows and
darkens under the pointer.
Don't: hide it on wide screens.

### code-block

`rounded.control`, `code` type, highlighted.
Don't: fake it with a div; the chat primitives mean something.

### sidebar row actions

A project's `+` and `...` and a chat's `...` appear when their own row is hovered or
focused, and a project row reveals only its own. They fade and slide in by a pixel. A
folder row has the same surface as a chat row.
Don't: reveal them with `aria-expanded`; `data-popup-open` is the open state.

## Do's and Don'ts

Rules have three levels. An **invariant** is linted with no disable. A **role** is linted
for use of its token; a missing role is added here in the same commit. A **default** is
written here; a deviation carries `// ui: <reason>`. Layout is never linted.

- Do use a role token; Don't write a raw size, colour or timing outside `components/ui`.
- Do add a role by adding the token to the front matter, running `bun run design`,
  describing it in one line, in one commit.
- Do compose the installed shadcn components with Base UI (`render={<Button />}`);
  Don't use `asChild` or fake a chat primitive with divs.
- Do let colour carry state only; Don't tint a resting surface.
- Do reveal a selection with one `enter-rise`.

## Motion

One curve (`ease-settle`, and `ease-overshoot` for a newly added chat's entrance), three durations (`fast`, `base`, `slow`) and five entrances:
`enter-fade`, `enter-rise`, `enter-drop`, `enter-left`, `enter-right`, with stagger steps
`enter-delay-1` to `-3`. A list's band and a picker drop in; a selected pane's tabs, body
and footer rise as one reveal. Reduced motion stops every non-essential animation, but a
spinner keeps turning. The entrances and utilities live in `src/app/styles/tokens.css` and
`motion.css`.

## Feedback

One surface per scope: see [feedback](docs/rules/feedback.md). By scope: the status strip
(app), the notice (a pane or a card), the status row (above the composer), the inline
status (beside a control), the status view (a pane's whole state).

## Voice

### VO-1 · A title is 2 to 5 words and says what happened or what is happening

A title is 2 to 5 words and says what happened or what is happening.

### VO-2 · A second line is optional, one sentence, and only says what to do

A second line is optional, one sentence, and only says what to do.

### VO-3 · Never explain internals

Never explain internals: no "on its own", "cannot explain", "registry", "supervisor", "evicts", "terminal-only", "engine" unless the user picks one.

### VO-4 · A button beats a sentence

A button beats a sentence: not "Reload to get the version that matches", but `[Reload]`.

### VO-5 · A description that repeats its label is deleted

A description that repeats its label is deleted; a switch needs no "Enabled".

### VO-6 · Plurals are computed

Plurals are computed: not "1 models", but "1 model".

### VO-7 · Empty states

Empty states: "No {plural} yet", no period.
