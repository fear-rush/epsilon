# Tight tooling, strict from line one

**Decision**

Type-aware Oxlint with every rule at error, the Effect rule preset, Oxfmt sorting, Knip with config hints as errors and cycle detection, strict TypeScript, `prek` hooks.

**Why**

With the old tree deleted there is nothing to clean up later, so every rule can be on from the first line. A rule added later costs a sweep and a debate. Cost accepted: the lint command is `effect-tsgo oxlint` (stock Oxlint cannot read the Effect preset), and an Oxlint bump past `1.90.0` must wait for `@effect/tsgo`.

**Rejected**

The `style` and `restriction` categories, `react-perf`, and per-rule severity tuning before there is code to judge.
