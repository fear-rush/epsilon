# Some lint disables could be written away

Every disable carries a reason, but these may not need to exist:

- `react-hooks/exhaustive-deps` on mount-only effects in `use-transcript-scroll.ts` and
  `code-editor.tsx`: a ref or `useEffectEvent` may replace them.
- `react/memo-dependencies` and `react/exhaustive-effect-dependencies` in
  `use-conversation-stream.ts`: the `Effect.gen` reads and the `epoch` trigger could be
  restructured.
- `typescript/no-unsafe-type-assertion` in `highlight.tsx` (shiki's `htmlStyle`): a decoded
  style object would remove the cast.
- `react/no-array-index-key` in `provider-models.tsx`, `provider-sign-in.tsx`,
  `changed-files-view.tsx`, `markdown.tsx`, `markdown-code-block.tsx`, `pair-rows.tsx`,
  `highlight.tsx`: stable ids where the data can carry one.

Do: remove one disable per commit where the rewrite keeps behaviour.
Don't: change behaviour to satisfy a rule; a disable with a true reason may stay.
Done when: each listed disable is removed or its reason says why it must stay.
Stop and ask when: a rewrite changes what the user sees or when an effect runs.
