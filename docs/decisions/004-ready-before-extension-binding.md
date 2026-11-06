# `ready` before extension binding

**Decision**

An engine reports ready, and accepts tabs, as soon as its runtime and session exist. Its commands and queries wait on a separate `bound` gate until pi's extensions have finished `session_start`.

**Why**

pi awaits every `session_start` handler, and an extension may ask a question there. The question needs an attached page, the page needs a tab, and the tab needs `ready`, so binding inside `ready` deadlocks: the chat does not open, and pi stays blocked. Splitting the two breaks the cycle and keeps a half-bound session from answering a prompt with the wrong tool list. A bind that fails refuses commands with the reason and raises a notice instead of killing the engine before its first frame. Cost accepted: a chat can be open, and look idle, while binding is in flight; the status line reports it busy, and a prompt sent then waits rather than failing.

**Rejected**

Answering a question asked during `session_start` with pi's default, which decides for the operator (a permission confirm would read as "no"). Buffering the question until a tab attaches without gating commands, which lets a prompt run with an unfinished tool set.
