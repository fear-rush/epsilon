# The index yields between slices, it is not a worker

**Decision**

The catalog reconciles session files in the process that holds the socket, and Effect does not preempt synchronous work. `sync` hands control back with `Effect.yieldNow` when a slice has run 40 ms, so one slice is the longest the server is deaf.

**Why**

A cold build on the owner's real home (1.8 GB, 955 sessions) took 14.7 s during which the server answered nothing, freezing every open tab. The fix is one loop condition, one writer, and no second process to own; `catalog-stall` (100 ms) reads 49 ms with it and 653 ms without, and a catalog test proves another fiber gets turns (it sees zero without the yield). Cost accepted: the cold build is about 7% slower (15.7 s), paid once when the index is built.

**Rejected**

A Worker with the index's write connection. A second context plus a message protocol buys nothing the clock-gated yield does not, and it would have to share the sqlite connection that must stay single-writer.
