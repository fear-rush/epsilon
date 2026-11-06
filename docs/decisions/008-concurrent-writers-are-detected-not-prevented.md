# Concurrent writers are detected, not prevented

**Decision**

pi does not lock session files. Epsilon enforces one writer per session where it can: an advisory lock file for other Epsilon processes, and a poll every 250 ms that compares size and mtime against the last append the engine recorded. A mark queued just after a change gets a 50 ms settle before the change is called foreign, because pi persists a message after it notifies. A foreign append makes the chat read-only in Epsilon with a notice and a Reload action. A running turn is not aborted; its next append is refused with the same notice. Reload disposes the runtime and re-opens it from the file.

**Why**

A terminal `pi --continue` beside an open tab is a legitimate thing to do. Losing the operator's other turn silently is not. Cost accepted: Epsilon cannot stop a terminal writer, so the contract is a notice.

**Rejected**

Rewriting pi's session manager. Blocking the file for other tools.
