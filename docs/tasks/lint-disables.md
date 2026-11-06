# One lint disable could not be written away

- `react-hooks/exhaustive-deps` on the mount-only layout effect in
  `use-transcript-scroll.ts`. Tried: the latest values in a ref refreshed by a layout
  effect, read by the mount effect with an honest `[]`. The ref route is accepted, but
  `useVirtualizer` is rejected by `react/incompatible-library` as soon as the hook is no
  longer skipped by the compiler (any `useEffectEvent`, or a ref holding the virtualizer),
  so the disable stays. Needs a virtualizer the compiler accepts.

Done when: the disable is removed or its reason is accepted.
