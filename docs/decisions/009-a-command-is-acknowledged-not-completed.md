# A command is acknowledged, not completed

**Decision**

The engine answers a `prompt` when pi accepts it (`preflightResult`), not when the run ends. Run failures arrive later as notices and frames; a rejected prompt fails the command. The same reply carries steer and follow-up acceptance.

**Why**

The old design awaited `prompt()`, so a slow `agent_settled` handler held the tab's command for as long as the handler ran (F6).

**Rejected**

Awaiting the whole run and reporting its outcome as the command result. A tab that reloads mid-run already rebuilds from the session file.
