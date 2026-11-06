# Plan: docs overhaul and UI consistency

Written 2026-11-06 at `1b0a4b0`, from a review of `src/app`, the settings pages and the
agent docs. This file is the entry point. Read it whole before you start any step.

## Goal

1. Agents get short, checkable instructions that load only where they apply, so they stop
   guessing, drifting or working around rules.
2. The UI speaks one language: one look per feedback tone, one empty state, one pane
   footer, short plain copy, tokens by role. Rules constrain roles and meaning, never
   layout, so a new feature still fits.

## Decisions already made by the owner (2026-11-06)

Do not re-open these. Do not ask about them again.

| #   | Decision                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Every file in `docs/` today (`README`, `ARCHITECTURE`, `DECISIONS`, `NEXT`, `effect`, `pi-sdk`) moves to `archive/docs-2026-11/`. New docs are written fresh.                                                                                                             |
| D2  | pi's facts (`pi-sdk.md`) and Effect's rules (`effect.md`) are kept: reshaped into the new layout, never dropped or rewritten from memory.                                                                                                                                 |
| D3  | `DESIGN.md` at the repository root follows the [design.md](https://github.com/google-labs-code/design.md) format and is the only source of design tokens. `src/app/styles/tokens.gen.css` is generated from it.                                                           |
| D4  | No dark mode for now. `DESIGN.md` and the generator cover light only. The existing `.dark` block in `src/app/index.css` is left as it is: not extended, not deleted. Screenshots are light only.                                                                          |
| D5  | `DESIGN.md` describes the **target**, not today's code. Where they differ, the code is wrong and a step in this plan fixes it.                                                                                                                                            |
| D6  | Rules have three levels. **Invariant**: lint, no disable. **Role**: lint checks that a role token is used; a missing role is added to `DESIGN.md` in the same commit. **Default**: written in `DESIGN.md`; a deviation carries `// ui: <reason>`. Layout is never linted. |

`main` is still the feature spec, but the visible changes this plan lists are approved
departures from it. Anything visible this plan does **not** list still needs the owner.

## Owner gates

Stop at these and ask, even though the plan describes them:

- **G1** (step 01): deleting the Claude memory files outside the repository.
- **G2** (step 06): bumping `PROTOCOL_VERSION`.
- **G3** (any step): a test or check fails for a reason you do not understand.

## Order

One step per commit, in this order. A step does not start until the one before it is ticked.

| Status | Step                                        | File                                                     | Visible to the user?  |
| ------ | ------------------------------------------- | -------------------------------------------------------- | --------------------- |
| [x]    | 01 Archive the old docs, build the skeleton | [01-archive-and-skeleton.md](01-archive-and-skeleton.md) | no                    |
| [x]    | 02 AGENTS.md: root and per folder           | [02-agents-md.md](02-agents-md.md)                       | no                    |
| [x]    | 03 Rules, map, decisions, pi, tasks         | [03-rules-and-reference.md](03-rules-and-reference.md)   | no                    |
| [x]    | 04 Guards: doc check, lint policy, shoot    | [04-guards.md](04-guards.md)                             | no                    |
| [x]    | 05 DESIGN.md and the token generator        | [05-design-md.md](05-design-md.md)                       | no (tokens unchanged) |
| [x]    | 06 Feedback: one look, one strip, codes     | [06-feedback.md](06-feedback.md)                         | **yes**               |
| [x]    | 07 Roles, patterns and lint                 | [07-roles-and-patterns.md](07-roles-and-patterns.md)     | **yes**               |
| [x]    | 08 Settings panes                           | [08-settings.md](08-settings.md)                         | **yes**               |
| [x]    | 09 Copy pass                                | [09-copy.md](09-copy.md)                                 | **yes**               |
| [x]    | 10 Split the large files                    | [10-splits.md](10-splits.md)                             | no                    |

The evidence behind every step (file:line, counts, screenshots) is in
[findings.md](findings.md). Read the part your step names; do not re-audit the codebase.

## How to work a step

1. Start from a clean tree on `refactor/rebuild`. If `git status` shows changes you did
   not make, stop and ask.
2. Read the step file whole, then only the files it names.
3. Line numbers in this plan are from `1b0a4b0`. Re-find each place with a search before
   you edit; if it is gone or changed shape, stop and ask rather than guess.
4. Do exactly the step's **Do** list. Something else you notice goes in
   `docs/tasks/<name>.md` (after step 03) or the bottom of this file (before it), not in
   this commit.
5. Meet every **Done when** line. Report each check's command, result and duration.
6. In the same commit: the code, its tests, the docs the change affects, and the `[x]` for
   the step in the table above. Message: `type(scope): what changed`.
7. When step 10 is ticked, move `docs/plan/` to `archive/docs-2026-11/plan/`.

## Never

- Never `oxlint-disable`, `@ts-expect-error`, `as unknown as`, `.skip` or a raised timeout
  to get a check green. If the right fix is unclear, stop and ask.
- Never write a fact about pi that is not in the pi reference. Never invent a token value:
  copy it from the file the step names.
- Never shorten a step by merging it with the next one.

## Noticed while working (not part of any step)

<!-- Add one line per item: what, where, which step found it. -->

- `transcript.tsx` and `code-editor.tsx` disable `react-hooks/exhaustive-deps` for a mount-only effect; may be rewritable with a ref or `useEffectEvent` → step 04 (reason added, code untouched)
- `use-conversation.ts` disables `react/memo-dependencies` and `react/exhaustive-effect-dependencies`; the Effect.gen reads and the `epoch` trigger could be restructured → step 04
- `highlight.tsx` casts shiki's `htmlStyle` with `no-unsafe-type-assertion`; a decoded style object would remove the cast → step 04
- Index keys in `provider-models.tsx`, `provider-sign-in.tsx`, `changed-files-view.tsx`, `markdown.tsx`, `markdown-code-block.tsx`, `pair-rows.tsx` and `highlight.tsx` could take stable ids where the data can carry one → step 04
- `scripts/shoot.ts` cannot see a pane that loads outside TanStack Query; `data-ready` covers the socket, the router and every query → step 04
- Step 10: `lib/utils.ts` only re-exported `cn` and `components.json` already pointed at `lib/cn`, so it was deleted. `bundle-size` was already over its 315 KiB budget before the step (396.8 KiB) and is 400.4 KiB after the split; `bun run bench` fails on that line alone.
- Step 10: transcript rows are rebuilt by `transcript()` on every call, so default `memo` could not skip them; `transcript-row-equal.ts` is the comparator `Row` and `AssistantRow` use.
