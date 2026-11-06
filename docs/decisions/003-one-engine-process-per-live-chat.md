# One engine process per live chat

**Decision**

Each open chat runs Epsilon's own small program in a child process, embedding pi's SDK inside an `AgentSessionRuntime`. The server supervises it: spawn, heartbeat, memory caps, restart policy, shutdown order, orphan cleanup.

**Why**

An engine or extension can throw, leak, spin or call `process.exit`, and Bun exits on an unhandled rejection. In one process that costs every chat and the dashboard; in a child it costs one chat, which restarts from its JSONL. Cost accepted: about 230 ms and 60 MB per open chat, a tagged message set to own, and registry answers that used to be synchronous become effects with a timeout.

**Rejected**

Keeping pi in-process and hardening it (still loses everything to a loop or `process.exit`). A worker per chat (memory limits are ignored, a native crash takes the parent). pi's `--mode rpc` (no reload, no tree navigation, no tools or system-prompt listing, `getEditorText()` empty). Engines outliving the server: they would need version-skew handling and orphan adoption.
