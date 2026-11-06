# Logs and crash reports exist before the failures do

**Decision**

One JSON-lines log in `<home>/.epsilon/logs/` with rotation and secret redaction. Every supervisor decision (spawn, kill, crash, recycle, eviction) is a line. A crash writes a record with the exit, signal, the last log lines, the heartbeat, and the versions, never message content. Settings → Diagnostics shows running engines and the last crash records, with a copy button.

**Why**

A child process exists so that its failures are containable; containable is only true if the failure is visible afterwards.

**Rejected**

Stdout scraping, or a crash report that carries conversation content.
