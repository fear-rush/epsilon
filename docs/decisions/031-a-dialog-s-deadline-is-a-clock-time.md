# A dialog's deadline is a clock time, not a countdown

**Decision**

The engine sends `deadlineAt`, the time the question closes at, read from `Clock`. The page counts down from it; a tab that attaches late, or a reconnect that replays the question, sees the time pi's deadline has left instead of restarting the count. pi's own `select`/`confirm`/`input` take a `timeout`, and the engine turns it into that time once.

**Why**

A countdown sent as a duration is only true at the moment it was sent, and main's server had to recompute the remaining time on every replay. One absolute time needs no recomputation and cannot drift between two tabs.

**Rejected**

`timeoutMs` as remaining milliseconds, or the page starting its own timer.
