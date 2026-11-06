# The composer's readings travel as their own frame

**Decision**

pi's context usage, the session's totals and the cache warmer are one `readings` frame. It follows a snapshot and is sent again when pi's numbers change: an assistant message ends, a compaction ends, a run settles. `main` carried them inside its snapshot state, which this branch does not have; the snapshot carries the window and notices, and its switches ride in `sessionMeta`. A reading is not a switch, and it changes on its own events. The cache warmer is the one reading that needs a timer: pi fires it on its own schedule and sends no session event, so the engine keeps one scoped fiber armed for `nextWarmAt` and publishes the reading when it wakes. A moment in the past is never armed again, so a coarse clock cannot spin.

**Why**

One frame for one answer, and a resync brings the numbers with the transcript instead of leaving the page to guess when they are stale.

**Rejected**

Fields on `sessionMeta`; polling the warmer on an interval; a countdown drawn by the page from a moment it never observed.
