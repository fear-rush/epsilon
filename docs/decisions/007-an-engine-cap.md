# An engine cap

**Decision**

`Engines.maxRunning` (default 8, in Epsilon's own settings file) counts engine processes, including the transient ones used for copy and export. At the cap, the supervisor closes the least recently used idle engine; it never kills a running turn. If nothing is evictable it refuses with the count and a pointer to the setting.

**Why**

Each engine is a process. Twenty tabs must not mean twenty processes, and silently killing a turn is worse than refusing a click.

**Rejected**

Unbounded processes with an OS-level OOM as the limiter.
