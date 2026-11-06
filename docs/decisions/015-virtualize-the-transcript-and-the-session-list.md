# Virtualize the transcript and the session list

**Decision**

`@tanstack/react-virtual` drives both, after the per-frame work is fixed and row keys are stable entry ids.

**Why**

A 5,000-entry chat and a 500-row sidebar are normal for an agent that has been used for a month. Virtualizing before the keys are stable would move the bug, not fix it.

**Rejected**

Paginating the transcript as the primary mechanism; it stays as the loading path for history beyond the window.
