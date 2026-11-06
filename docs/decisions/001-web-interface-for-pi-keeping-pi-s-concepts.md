# Web interface for pi, keeping pi's concepts

**Decision**

Epsilon brings pi to the browser instead of the TUI. pi's files stay the only truth: sessions as JSONL, `settings.json`, `models.json`, `auth.json`, MCP, packages, trust. A terminal pi on the same home is the same agent, and Settings writes there.

**Why**

The operator already has an agent home; a second, Epsilon-shaped store would make the dashboard and the terminal two different agents.

**Rejected**

A database of Epsilon sessions. A vendored copy of pi's concepts with different names.
