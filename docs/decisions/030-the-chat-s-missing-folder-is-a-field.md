# The chat's missing folder is a field of the list

**Decision**

`SessionSummary.cwdMissing` is computed by the server when the list is read, one stat per distinct folder, and it travels with the row. The page gates on it before it attaches.

**Why**

Only the server can answer whether a folder still exists, and the gate must decide before an engine starts. A second read from the page would be a second truth for the same question.

**Rejected**

The page checking through a folder-picker call, or the engine refusing after it attached. Both would show the chat first and explain second.
