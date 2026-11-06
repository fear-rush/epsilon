# 07 Roles, patterns and lint

Make the role tokens from step 05 real, give features the shared patterns they keep
rebuilding, and loosen the rules that lock layout. Evidence:
[findings.md → Styling](findings.md#styling), [→ Motion](findings.md#motion),
[→ Structure](findings.md#structure).

## Do

1. **Radius roles.** Replace `rounded-{sm,md,lg,xl,2xl,full}` in `src/app/features/`,
   `components/patterns/` and `components/ai-elements/` with the roles from `DESIGN.md`:
   `rounded-chip`, `rounded-control`, `rounded-card`, `rounded-bubble`, `rounded-pill`. Use
   the mapping in `DESIGN.md` → Shapes; where a use fits no role, stop and ask (do not
   pick the nearest). `components/ui/` keeps shadcn's names.
2. **Icon roles.** Add `size-icon-sm` (0.875rem) and `size-icon` (1rem) to `DESIGN.md`,
   regenerate, and replace `size-3.5`/`size-4` on icons outside `components/ui/`. A
   `size-6` in a `StatusView` becomes `size-icon-lg` (1.5rem), added the same way.
3. **Motion tokens.**
   - `src/app/styles/motion.css`: the raw `200ms`, `280ms` and the inline
     `cubic-bezier(0.16, 1, 0.3, 1)` become `var(--duration-*)`/`var(--ease-settle)`. The
     overshoot curve `cubic-bezier(0.34, 1.56, 0.64, 1)` (new-chat entrance) becomes a
     named token `ease-overshoot` in `DESIGN.md`.
   - `transition-panel` in `tokens.css` uses `duration-base`.
   - `components/ui/` overlays (`dialog`, `alert-dialog`, `sheet`, `popover`,
     `dropdown-menu`, `context-menu`, `select`, `tooltip`, `hover-card`): `duration-100`,
     `150`, `200`, `300` → `duration-fast`/`base`; their easing → `ease-settle`. One
     comment per file: "local change: Epsilon's motion tokens".
   - Replace `transition-all` (9 uses) with the property that actually changes.
   - Reduced motion: the global rule in `motion.css` stops every animation, which
     freezes spinners. Exempt `animate-spin`. Guard JS smooth scrolling in
     `features/conversation/transcript.tsx` (rail ~136–153, ~321, ~431) with
     `matchMedia("(prefers-reduced-motion: reduce)")`: `behavior: "auto"` when it matches.
4. **One focus ring.** `DESIGN.md` → Components gets `focus`: `ring-3 ring-ring/50`,
   no offset. Make `ui/button`, `ui/input`, `ui/sidebar` menu buttons and every custom
   focusable row in `features/` use it. Search for `focus-visible:ring-` and
   `focus-visible:outline` to find them.
5. **Cancel is `outline`.** Every `Cancel` button with `variant="destructive"` becomes
   `outline` (13 in `features/settings/`; search all of `src/app`). Approved departure
   from `main`. A button that stops a running action ("Stop") stays destructive.
6. **New `components/patterns/empty-state.tsx`**: `icon?`, `title`, `action?`. Title
   follows VO-7. It is the only empty state: `StatusView`'s empty use and the bordered
   "No … yet" cards on form pages (Diagnostics, Projects) both move to it. Done in step 08
   for settings; in this step create it and use it in one place (the session sidebar's
   empty list, if it has one, else Packages).
7. **Dialog height.** `components/patterns/dialog-frame.tsx` gives the body a fixed
   height per size (~line 24). Change `fixed` to a **min-height** of today's value plus
   `max-h-[80vh]` with internal scroll. Keep `body="content"` as is. Steps still do not
   jump (min-height), and content no longer floats in empty space.
8. **Patterns import no feature.** Move `components/patterns/scope-tabs.tsx` and
   `components/patterns/list/list-pane.tsx` to `features/settings/shell/` (they import
   `@/features/projects`, `@/features/sessions`, `@/features/settings/queries`). Update
   imports. Then extend `epsilon/no-feature-internals` (or add a rule) so a file in
   `src/app/components/**` importing `@/features/**` is an error.
9. **`epsilon/design-tokens`** (`tools/oxlint/epsilon/rules/design-tokens.ts` and
   `shared/design-tokens.ts`):
   - Add spacing steps `5`, `10`, `12` (`spacingSteps`, ~line 17). The lint message says
     "use a role (gap-field, pad-row…) or a step".
   - Check `rounded-*`: outside `components/ui/` and `components/editor/`, only the role
     names and `rounded-none` pass.
   - Check icon `size-*` on lucide icons only if it can be done reliably (the element name
     ends in `Icon`); otherwise leave it to review and say so in the rule.
   - Width, height, grid, flex, position: not checked (D6). Arbitrary values (`w-[37rem]`)
     stay refused as today. Add test cases proving that `w-80`, `max-w-content`,
     `grid-cols-3` and `h-full` pass.
   - Every message cites its `DESIGN.md` section.

## Don't

- Don't restyle anything beyond the swaps above. A swap that changes a pixel by more than
  the role mapping implies is a stop-and-ask.
- Don't touch `components/ui/` beyond the motion and focus lines.

## Done when

- `bun run lint` passes with no new disables; the lint rule's own tests
  (`bun run test:tools`) cover the new cases.
- `bun run check` passes; report the duration.
- `bun run shoot` of every settings section and one chat, plus playwright-cli shots of a
  run card open and Add MCP server open, read by you, compared side by side with the shots taken at the end of step 05: the
  only differences are the Cancel buttons and the dialog's height.
- `bun run test:e2e`, full, passes (this step touches more than one feature); report the
  duration.

## Stop and ask when

- A radius or icon use fits no role.
- A screenshot differs in a way the Do list does not explain.
