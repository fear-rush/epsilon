# One package, no workspaces

**Decision**

One `package.json`, one lockfile, no turbo. `src/protocol`, `src/domain`, `src/backend`, `src/engine`, `src/app` are separated by tsconfig project references and lint import rules.

**Why**

Three packages existed to separate DOM types from Bun types and to run three build tasks. Project references do the first; one Vite build and one server build do the second.

**Rejected**

Keeping turbo for a two-command build.
