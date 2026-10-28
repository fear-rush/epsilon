# A partial commit can fail on a stale build

## Symptom

`git commit` refused with a type error in code that had just passed `bun run
type-check`, naming a field that existed in the source (`commands` in
`Snapshot`) but not in the type being resolved. Nothing in the working tree was
inconsistent: the full check passed minutes earlier.

## Cause

Dist and build output are gitignored, so they are not part of a commit and not
part of the pre-commit hook's stash. The hook saves unstaged changes, checks the
staged tree, then restores the worktree. A build that runs while the worktree is
in the stashed state writes `shared/dist` for the old source, and that artifact
outlives the hook because restoring the stash only touches tracked files. The
next type-check then reads a `shared/dist/*.d.ts` that describes a different
commit.

## Fix

Rebuild before committing partially staged work:

```
bun run build --force
```

Staging whole changes at once avoids it, because the hook then finds nothing to
stash.

## Check

`grep commands shared/dist/protocol/frames.d.ts` matches the current
`shared/src/protocol/frames.ts`. When the two disagree, the dist is stale.
