# A dialog mounted open has no motion

## Symptom

The router's "Discard unsaved changes?" dialog popped in without its enter
transition and vanished without its exit transition. The CSS already used Base UI's
`data-starting-style` and `data-ending-style`.

## Cause

The dialog was rendered only while the route block was active, with `open` already
true, and Stay or Discard unmounted it immediately. Base UI does not animate an
initial open by default, and unmounting skips the ending state entirely. The props
were correct; the mount lifetime was not.

## Fix

`provider-discard-dialog.tsx` mounts closed and opens on the next animation frame.
On Stay, Discard, Escape or a backdrop click it closes first, waits 180ms for the
150ms transition, then calls the router's `reset` or `proceed`. Both actions are
disabled while closing so a double click cannot run the route action twice.

## Check

Open a provider, edit it, and navigate away. The dialog fades and scales in and
out. `bun run lint` and `bun run type-check` cover the component; the animation
itself is a browser check.
