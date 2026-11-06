# One lint disable could not be written away

- `react-hooks/exhaustive-deps` on the mount-only layout effect in
  `use-transcript-scroll.ts`: `useEffectEvent` removes it, but the compiler then analyses
  the file and `react/incompatible-library` rejects `useVirtualizer`. Needs a virtualizer
  that the compiler accepts, or the owner's yes to a different disable.

Done when: the disable is removed or its reason is accepted.
Stop and ask when: a rewrite changes what the user sees or when an effect runs.
