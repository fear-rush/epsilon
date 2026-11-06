# A feature that needs the other direction takes data as a prop

**Decision**

`sessions` imports `projects` (the sidebar opens the folder picker), so `projects` may not import `sessions`. The continue gate needs the chat list, which `sessions` owns: its caller reads the list once and passes `recent` down, rather than `projects/queries.ts` growing a hook that reads across the edge. The lint's `no-feature-internals` and `no-cycle` rules enforce both halves.

**Why**

main had no such edge because every feature called its own HTTP endpoint. One socket with feature roots makes the direction explicit, and a cycle here is a real build-order problem, not a style preference.

**Rejected**

Lifting the read into `hooks/` or `lib/` yet. The file rules say to do that on the third use; this is the second.
