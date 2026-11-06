# A chat pi cannot total opens, and says why

**Decision**

pi's `getSessionStats()` reads `message.usage.input` on every assistant message and throws when one has none, which only a hand-written file does. The readings are computed on the engine's event loop behind `Effect.try`; a chat pi cannot total sends one notice ("This chat's readings could not be read: …") and keeps serving.

**Why**

The snapshot computed the readings inline, so such a file killed the engine during attach, the supervisor recorded a crash, and the next message reattached into the same crash. A missing usage block is a bad reading, not a bad chat.

**Rejected**

Refusing the file with words. Trusting the numbers and rendering zero totals, which would be a lie about cost.
