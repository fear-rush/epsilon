# Registry defaults fight local overrides

## Symptom

Three complaints in a row on the same screen: the model combobox showed an arrow
cursor on hover, the settings checkbox tick rendered at roughly 24px and spilled out
of its 16px box, and clicking a checkbox had no motion at all. A base-layer
`[role="option"] { cursor: pointer }` rule was already in `client/src/index.css` and
did nothing.

## Cause

- The registry ships `cursor-default` on command, select and menu items. That is a
  utility class, so it wins over a base-layer rule no matter how specific the base
  selector is.
- cmdk writes `data-disabled="false"` on every enabled paragraph item. A rule that
  excludes disabled rows with `:not([data-disabled])` therefore never matches an
  enabled one either.
- The registry's checkbox has no motion: `transition-shadow` on the box and
  `transition-none` on the indicator, which is unmounted while unchecked. When the
  indicator class was rewritten to animate it, `[&>svg]:size-3.5` was dropped with
  it, so the lucide `CheckIcon` fell back to its 24px default inside a 16px box.

## Fix

- Remove `cursor-default` from the four registry components and key the pointer rule
  on `aria-disabled="true"`, which cmdk and Base UI both set only when disabled.
- Keep the checkbox indicator mounted (`keepMounted`) and transition `scale` and
  `opacity`; keep `[&>svg]:size-3.5` in the same class string.
- When a registry class string is rewritten, diff it against the file from
  `bunx --bun shadcn@latest view <component>` instead of retyping it.

## Check

With the dev loop up: hovering a model row shows a pointer, a checkbox tick eases in
at 14px inside the 16px box, and `rg cursor-default client/src/components/ui`
returns nothing.
