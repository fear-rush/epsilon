# Upgrading pi is a procedure, not a version bump

**Decision**

pi is pinned exactly. An upgrade is one commit that reads pi's changelog, runs the catalog conformance test, re-checks the facts in docs/pi/ that code relies on (docs/pi/upgrading.md), and passes `check`, e2e and benchmarks. An upgrade that fails for a reason not understood is refused.

**Why**

The index reads pi's fields directly and the engine depends on pi's runtime shape. A silent behaviour change there breaks chats in ways tests would otherwise miss.

**Rejected**

A version range, or upgrading to pick up a feature mid-step.
